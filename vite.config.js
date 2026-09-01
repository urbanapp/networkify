import { defineConfig } from 'vite';

export default defineConfig({
    // Relative asset URLs so the built dist/ works from any subpath
    base: './',
    build: {
        rollupOptions: {
            // Two pages: landing at /, editor at /app/
            input: {
                landing: 'index.html',
                app: 'app/index.html',
            },
        },
    },
});
