# Manta IDE
![](https://img.shields.io/badge/Node.js-18%2B-brightgreen?style=flat-square) [![npm]](https://www.npmjs.com/package/manta-ide)

[npm]: https://img.shields.io/npm/v/manta-ide.svg?style=flat-square

Manta IDE is a graph-based development environment that lets you code by creating and editing natural-language nodes on a graph. 

## ⚡ Quick Start

1. Install and setup Codex by OpenAI:
   https://github.com/openai/codex

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
- **Coding agents compatibility**: Use your existing coding agents with MCPs (currently supports Codex)
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
   npm install -g .

4. Install the template and run Manta IDE in an empty folder:
   ```bash
   manta i
   manta run
