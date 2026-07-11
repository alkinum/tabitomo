# tabitomo - AI-Powered Translator

**tabitomo** (旅友 - "Travel Companion") is a modern, cute, and compact AI-powered translation tool designed to help users communicate effortlessly across languages.

## 🌟 Product Overview

**Product Name:** tabitomo
**Purpose:** AI-powered multilingual translator with text, audio, and image input support
**Target Users:** Travelers, language learners, and anyone needing quick translations

## 🎨 Design Philosophy

### Visual Style
- **Flat Design with Depth:** Clean, minimalist flat design enhanced with subtle flat shadows
- **Cute & Modern:** Friendly, approachable interface with smooth animations
- **Compact & Intuitive:** Streamlined UI optimized for quick, easy interactions
- **Three-Dimensional Feel:** Flat shadows and animations create tactile, engaging controls

### Design Elements
- **Flat Shadows:** Controls use `box-shadow` to create depth (e.g., `0 4px 0 rgba(0,0,0,0.1)`)
- **Active Feedback:** Buttons compress on press with shadow/transform animations
- **Smooth Transitions:** All interactions feature 200-300ms ease transitions
- **Cute Animations:** Bouncing dots for loading states, fade-in effects for content

## 🛠️ Tech Stack

### Core Technologies
- **Framework:** React 19 with TypeScript
- **Build Tool:** Vite
- **Package Manager:** pnpm
- **Styling:** UnoCSS with Tailwind preset (replacing Tailwind CSS)
- **UI Components:** shadcn/ui components adapted for UnoCSS
- **Icons:** Lucide React

### AI & Translation
- **AI SDK:** Vercel AI SDK
- **AI Provider:** OpenAI-compatible API services
- **Translation:** AI-powered with support for multiple languages

### Input Methods
1. **Text Input:** Direct keyboard input with auto-translation
2. **Audio Input:** Speech recognition (Web Speech API) + AI translation
3. **Image Input:** OCR text extraction + AI translation

## 📁 Project Structure

```
tabitomo/
├── src/
│   ├── components/
│   │   ├── TranslationTool.tsx      # Main translation interface
│   │   ├── TextInput.tsx            # Text input component
│   │   ├── AudioInput.tsx           # Audio recording component
│   │   ├── ImageInput.tsx           # Image upload component
│   │   ├── TranslationResult.tsx    # Translation display
│   │   └── ui/                      # shadcn/ui components
│   ├── lib/
│   │   └── utils.ts                 # Utility functions (cn, etc.)
│   ├── utils/
│   │   ├── mockTranslation.ts       # Mock translation (to be replaced)
│   │   └── aiTranslation.ts         # AI translation service (to be added)
│   ├── App.tsx                      # Main app component
│   ├── AppRouter.tsx                # Routing setup
│   ├── index.tsx                    # Entry point
│   └── index.css                    # Global styles
├── vite.config.ts                   # Vite configuration
├── uno.config.ts                    # UnoCSS configuration (to be added)
├── tsconfig.json                    # TypeScript config
├── package.json                     # Dependencies
└── AGENTS.md                        # This file
```

## 🎨 Design System

### Color Palette
- **Primary:** Indigo (`#6366f1`) - Main brand color
- **Secondary:** Purple tones for gradients
- **Background:** Gradient from indigo-50 to purple-50
- **Accents:** Soft pastels for a cute, friendly feel

### Animation Patterns
```css
/* Flat shadow buttons */
.cute-shadow {
  box-shadow: 0 4px 0 rgba(0,0,0,0.1);
  transform: translateY(0);
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.cute-shadow:active {
  box-shadow: 0 2px 0 rgba(0,0,0,0.1);
  transform: translateY(2px);
}

/* Pop effect for buttons */
.btn-pop {
  transition: transform 0.2s ease;
}

.btn-pop:active {
  transform: scale(0.95);
}
```

### Typography
- **Headings:** Bold, friendly sans-serif
- **Body:** Clean, readable sans-serif
- **Sizes:** Compact but legible (14-16px base)

## Cross-Platform Development Skill

For any feature, UI, settings, provider, persistence, import/export, or shared-core change, use the project skill at `.agents/skills/tabitomo-platform-parity/SKILL.md`. It defines the required Web/Mobile parity workflow and the iOS-first Expo exceptions.
