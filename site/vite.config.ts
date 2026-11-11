import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Site statique servi par GitHub Pages sous https://baptistefaisy.github.io/placard-wiki/
// → la base '/placard-wiki/' est OBLIGATOIRE (chemins d'assets relatifs au dépôt).
export default defineConfig({
  base: '/placard-wiki/',
  plugins: [react()],
  build: {
    outDir: 'dist',
    // Pas de sourcemaps publiés : la démo n'a rien à cacher, mais reste sobre.
    sourcemap: false,
  },
});
