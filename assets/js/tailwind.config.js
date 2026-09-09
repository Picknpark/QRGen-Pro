// The Tailwind CDN exposes this global and rebuilds when its config changes.
window.tailwind = window.tailwind || {};
window.tailwind.config = {
    darkMode: 'class',
    theme: {
        extend: {
            colors: {
                brand: {
                    50: '#f0f7ff',
                    100: '#e0effe',
                    500: '#2563eb',
                    600: '#1d4ed8',
                    700: '#1e40af'
                }
            }
        }
    }
};
