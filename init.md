# ConceptMesh - AI-Powered Interactive Learning Visualizations

## What It Is
An educational tool that transforms abstract concepts into interactive visualizations using a **multi-shot agentic AI pipeline**. Users click on concepts (like binary search, derivatives, neural networks) and get custom-built React visualizations that create aha moments.

## How It Works

**Multi-Shot Generation Pipeline:**
1. **Context Shot** - Provides full project context and analyzes the concept
2. **Planning Shot** - AI creates detailed visualization strategy (layout, interactivity, animations)
3. **Generation Shot** - Produces actual React code with canvas graphics
4. **Validation Shot** - Auto-fixes code errors if needed

## Key Features
- **Smart Technique Selection** - Maps concepts to optimal visualization patterns (arrays → bar charts, calculus → coordinate planes, algorithms → step-by-step animations)
- **Knowledge Graph Structure** - Concepts link to prerequisites and applications, creating learning paths
- **Caching System** - Saves generated visualizations for instant reload
- **Pure React.createElement** - No JSX, uses canvas for graphics, includes interactive controls (sliders, buttons, step-through)

## Tech Stack
- React (hooks: useState, useEffect, useRef)
- Anthropic Claude API (Sonnet 4)
- HTML5 Canvas for visualizations
- In-memory caching

## Use Cases
- Computer Science (algorithms, data structures, ML)
- Mathematics (calculus, algebra, probability)
- Physics (kinematics, forces, waves)

**Core Innovation:** Instead of generic explanations, it generates pedagogically-sound, domain-specific interactive visualizations tailored to each concept's unique teaching needs.
