# Manta IDE
![](https://img.shields.io/badge/Node.js-18%2B-brightgreen?style=flat-square) [![npm]](https://www.npmjs.com/package/manta-ide)
[![Discord](https://img.shields.io/discord/1313987593305718816?label=Discord&logo=discord)](https://discord.gg/rENSEgVsz6)

[npm]: https://img.shields.io/npm/v/manta-ide.svg?style=flat-square

Manta IDE is a graph-based development environment that lets you code by creating and editing natural-language nodes. 

<img width="1907" height="1078" alt="image" src="https://github.com/user-attachments/assets/f4833ccd-b61d-4f42-abff-c449bfffded8" />

## ⚡ Quick Start

1. Obtain your Anthropic API Key:
   https://console.anthropic.com/settings/keys

2. Install Manta CLI:
   ```bash
   npm i -g manta-ide

3. Install the template to an empty folder:
   ```bash
   manta i

4. Run Manta IDE in the same folder:
   ```bash
   manta run

5. Open [http://localhost:3000](http://localhost:3000)

## 💡 Features

- **Node-based creation**: Create nodes and direct AI to build them, and get a stateful editable system
- **MCP compatibility**: Use any MCPs you like to make the agent better
- **Properties**: Each node has properties that you can edit in real-time for quick updates

## 🧑‍💻 Developers

1. Install and setup Codex by OpenAI:
   https://github.com/openai/codex
   
2. Clone the repository:

   ```bash
   git clone https://github.com/manta-ide/manta.git
  
3. Install dependencies:

   ```bash
   cd manta
   npm run i:all
   npm run build:all
   npm i -g .

4. Install the template and run Manta IDE in an empty folder:
   ```bash
   manta i
   manta run
