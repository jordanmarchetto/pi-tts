/**
 * Pi-TTS Extension
 * Reads the last message aloud using text-to-speech
 */

import { readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Key, parseKey, truncateToWidth } from "@earendil-works/pi-tui";

const DEFAULT_SHORTCUT = "ctrl+shift+h";
const SETTINGS_PATH = join(homedir(), ".pi", "agent", "pi-tts.json");

// Stored as { version: 1, shortcut: "ctrl+shift+h" }. Read synchronously so the
// shortcut is live from the first keystroke of the session.
function readShortcut(): string {
  try {
    const parsed = JSON.parse(readFileSync(SETTINGS_PATH, "utf8")) as Record<string, unknown>;
    if (parsed && parsed.version === 1 && typeof parsed.shortcut === "string") {
      return parsed.shortcut;
    }
  } catch {
    // Missing or invalid file falls through to the default.
  }
  return DEFAULT_SHORTCUT;
}

function saveShortcut(shortcut: string): void {
  writeFileSync(SETTINGS_PATH, JSON.stringify({ version: 1, shortcut }, null, 2) + "\n");
}

// A simple implementation that gets the last message content and reads it aloud
export default function piTts(pi: ExtensionAPI): void {
  // Function to read text aloud using the system TTS
  async function speakText(text: string, ctx: ExtensionContext): Promise<void> {
    if (!ctx.hasUI) {
      console.log(`[TTS] Reading: ${text}`);
      return;
    }

    try {
      // Show status widget while speaking - set immediately
      const statusWidget = [ctx.ui.theme.fg("muted", "Speaking...")];
      ctx.ui.setWidget("tts-status", statusWidget);

      // Use the system TTS if available, or fallback to console log
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        // Browser environment - use Web Speech API
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 1.0;
        utterance.pitch = 1.0;
        speechSynthesis.speak(utterance);
      } else if (process.platform && process.platform === 'darwin') {
        // macOS - use osascript to speak using system voices
        const { execSync } = await import('node:child_process');
        const escapedText = text.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
        execSync(`osascript -e 'say "${escapedText}"'`);
      } else if (process.platform && process.platform === 'linux') {
        // Linux - try festival or espeak
        const { execSync } = await import('node:child_process');
        try {
          execSync(`echo "${text}" | espeak -s 140`, { stdio: 'ignore' });
        } catch {
          try {
            execSync(`echo "${text}" | festival --tts`, { stdio: 'ignore' });
          } catch {
            console.log(`[TTS] Could not speak text (no TTS utility available): ${text}`);
          }
        }
      } else if (process.platform && process.platform === 'win32') {
        // Windows - use PowerShell to speak via SAPI
        const { execSync } = await import('node:child_process');
        const escapedText = text.replace(/"/g, '""');
        execSync(`powershell -command "Add-Type -AssemblyName System.Speech; $speak = New-Object System.Speech.Synthesis.SpeechSynthesizer; $speak.Speak('${escapedText}');"`);  
      } else {
        // Fallback to console output
        console.log(`[TTS] Speaking: ${text}`);
      }
      
      // Clear status widget after a delay (but we show it immediately above)
      setTimeout(() => {
        ctx.ui.setWidget("tts-status", undefined);
      }, 1000);
    } catch (error) {
      console.error('[TTS] Error speaking text:', error);
      ctx.ui.setWidget("tts-status", [ctx.ui.theme.fg("error", "Error speaking")]);
      setTimeout(() => {
        ctx.ui.setWidget("tts-status", undefined);
      }, 2000);
    }
  }

  // Function to get the last message and read it aloud
  async function readLastMessage(ctx: ExtensionContext): Promise<void> {
    try {
      // Get recent conversation history using session manager
      const entries = ctx.sessionManager.getEntries();
      
      if (entries && entries.length > 0) {
        // Find the most recent assistant message (since that's what we usually want to read)
        let lastAssistantMessage = null;
        
        // Iterate backwards to find the most recent assistant message
        for (let i = entries.length - 1; i >= 0; i--) {
          const entry = entries[i];
          // Added safety check: ensure entry is properly formed
          if (entry && entry.type === "message" && entry.message && entry.message.role === 'assistant') {
            lastAssistantMessage = entry;
            break;
          }
        }
        
        if (lastAssistantMessage && lastAssistantMessage.message.content) {
          let contentText = '';
          
          if (typeof lastAssistantMessage.message.content === 'string') {
            contentText = lastAssistantMessage.message.content;
          } else if (Array.isArray(lastAssistantMessage.message.content)) {
            // Handle structured content (could be multiple parts, text and images etc.)
            contentText = lastAssistantMessage.message.content
              .filter(part => part && part.type === 'text' && part.text)
              .map(part => part.text)
              .join(' ');
          }
          
          if (contentText) {
            // Speak the content
            await speakText(contentText, ctx);
          } else {
            console.log('[TTS] No text content found in last message');
            ctx.ui.setWidget("tts-status", [ctx.ui.theme.fg("muted", "No text to read")]);
            setTimeout(() => {
              ctx.ui.setWidget("tts-status", undefined);
            }, 2000);
          }
        } else {
          console.log("[TTS] No assistant messages found in conversation history");
          ctx.ui.setWidget("tts-status", [ctx.ui.theme.fg("muted", "No message to read")]);
          setTimeout(() => {
            ctx.ui.setWidget("tts-status", undefined);
          }, 2000);
        }
      } else {
        console.log('[TTS] No conversation history available');
        ctx.ui.setWidget("tts-status", [ctx.ui.theme.fg("muted", "No history")]);
        setTimeout(() => {
          ctx.ui.setWidget("tts-status", undefined);
        }, 2000);
      }
    } catch (error) {
      console.error('[TTS] Error getting last message:', error);
      ctx.ui.setWidget("tts-status", [ctx.ui.theme.fg("error", "Error reading message")]);
      setTimeout(() => {
        ctx.ui.setWidget("tts-status", undefined);
      }, 2000);
    }
  }

  // Extension shortcuts are literal keys, not keybindings.json ids, so we store
  // our own setting and register it at startup. Changes apply after /reload.
  pi.registerShortcut(readShortcut() as Parameters<ExtensionAPI["registerShortcut"]>[0], {
    description: "Read last assistant message aloud",
    handler: (ctx) => readLastMessage(ctx),
  });

  pi.registerCommand("tts-key", {
    description: "Record a new keyboard shortcut for reading the last message",
    handler: async (_args, ctx) => {
      const pressed = await ctx.ui.custom<string | undefined>(
        (_tui, theme, keybindings, done) => ({
          render(width: number): string[] {
            return [
              truncateToWidth(
                theme.fg("accent", theme.bold("Press a key for TTS (Esc to cancel)")),
                width,
              ),
            ];
          },
          handleInput(data: string): void {
            if (keybindings.matches(data, "tui.select.cancel")) {
              done(undefined);
              return;
            }
            const parsed = parseKey(data);
            if (parsed) done(parsed);
          },
          invalidate() {},
        }),
      );

      if (!pressed) return;
      // Bare printable keys would shadow normal typing; require a modifier or F-key.
      const needsModifier = !/^(f(?:[1-9]|1[0-2]))$/.test(pressed);
      const hasModifier = pressed.includes("+");
      if (needsModifier && !hasModifier) {
        ctx.ui.notify(`Refusing bare key "${pressed}" — include a modifier like ctrl or alt`, "error");
        return;
      }
      saveShortcut(pressed);
      ctx.ui.notify(`Saved ${pressed}. Run /reload or restart pi to apply.`, "info");
    },
  });

  // Register the command
  pi.registerCommand("tts-read-last", {
    description: "Read the last assistant message aloud using text-to-speech",
    handler: (_args, ctx) => readLastMessage(ctx),
  });

  // Also add a command that can be run manually
  pi.registerCommand("tts", {
    description: "Read the last assistant message aloud using text-to-speech",
    handler: (_args, ctx) => readLastMessage(ctx),
  });
}