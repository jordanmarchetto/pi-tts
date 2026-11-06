# Pi-TTS Extension

A Pi extension that reads the last message aloud using text-to-speech when triggered by a keybinding or command.

## Features

- Reads the last user message aloud using system TTS capabilities 
- Keybinding: `Ctrl+Shift+T` (can be customized)
- Manual command: `/tts` or `/tts-read-last`
- Supports multiple platforms (macOS, Windows, Linux, and browser environments)

## Installation

1. Place this extension in your Pi extensions directory
2. Restart Pi to load the extension
3. Use `Ctrl+Shift+T` to read the last message aloud, or type `/tts` 

## Usage

### Keybinding
Press `Ctrl+Shift+T` to speak the content of the last message.

### Command
Type `/tts` or `/tts-read-last` in the command bar to read the last message.

## Supported Platforms

- **macOS**: Uses built-in `say` command
- **Windows**: Uses PowerShell SAPI
- **Linux**: Uses `espeak` or `festival`
- **Browser**: Uses Web Speech API

## Customization

You can customize the keybinding by modifying the extension source code or through Pi's keybinding configuration if available.