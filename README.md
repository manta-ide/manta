# Manta IDE
[![](https://getmanta.ai/api/badges?text=Manta%20Graph&link=manta)](https://getmanta.ai/manta)
![](https://img.shields.io/badge/Node.js-18%2B-brightgreen?style=flat-square) [![npm]](https://www.npmjs.com/package/manta-ide)
[![Discord](https://img.shields.io/discord/1313987593305718816?label=Discord&logo=discord)](https://discord.gg/rENSEgVsz6)


[npm]: https://img.shields.io/npm/v/manta-ide.svg?style=flat-square

Manta IDE is a graph-based development environment that lets you code by creating natural-language nodes. 

<img width="1271" height="809" alt="image" src="https://github.com/user-attachments/assets/6223bc1a-bc5f-4ab1-8f2a-6af1d3cfc10c" />

## ⚡ Quick Start

1. Install and setup Claude Code by Anthropic:
   https://docs.claude.com/en/docs/claude-code/setup

2. Install Manta IDE:
   ```bash
   npm i -g manta-ide

3. Run the IDE:
   ```bash
   manta run

5. Open [http://localhost:3000](http://localhost:3000)

## 💡 Features

- **Node-based creation**  
Create nodes and direct AI to build them, and get a stateful editable system.
The nodes are softly structured, so any node can be connected to any other node, like on a jam board.
This makes it possible to create an architecture diagram, user flow, or a graph of features. 
- **Properties**  
Each node has properties that you can edit to add content or change the components.
Properties are generated based on your node or prompt, so you can decide which parts should be configurable.
The properties are not affecting the code, they are used only to direct the coding agent to make a concrete change (color, padding, etc.)
- **Indexing**  
Indexing is done via agent, so you can work on high level of abstraction, or even the lowest one like a node per function or variable.
You can also see how your app works from different angles, or check if there are any dependencies between modules that need to be removed for refactoring.  

## 🧑‍💻 Developers

1. Install and setup Claude Code by Anthropic:
   https://docs.claude.com/en/docs/claude-code/setup
   
2. Clone the repository:

   ```bash
   git clone https://github.com/manta-ide/manta.git
  
3. Install dependencies and build:

   ```bash
   cd manta
   npm i
   npm run build

4. Configure environment variables (optional, for MCP OAuth):
   ```bash
   cp ENVIRONMENT_VARIABLES.md .env.local
   # Edit .env.local with your OAuth settings

5. Run the solution:
   ```bash
   npm run dev

6. Open [http://localhost:3000](http://localhost:3000)
