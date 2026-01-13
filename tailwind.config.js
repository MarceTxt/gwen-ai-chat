/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      // 👇 Adicione cores personalizadas (opcional)
      colors: {
        'gwen-primary': '#3B82F6',
        'gwen-secondary': '#1E40AF',
        'gwen-dark': '#1F2937',
      },
      
      // 👇 Adicione fontes personalizadas (opcional)
      fontFamily: {
        'sans': ['Inter', 'system-ui', 'sans-serif'],
      },
    },
    
    // 👇 CONFIGURAÇÃO DOS BREAKPOINTS (IMPORTANTE!)
    screens: {
      'xs': '475px',   // Extra small (opcional)
      'sm': '640px',   // Small - celular grande
      'md': '768px',   // Medium - tablet
      'lg': '1024px',  // Large - desktop pequeno
      'xl': '1280px',  // Extra large - desktop normal
      '2xl': '1536px', // 2x large - desktop grande
      
      // 👇 Você pode adicionar breakpoints específicos
      'tablet': '640px',   // Alias para tablet
      'laptop': '1024px',  // Alias para laptop
      'desktop': '1280px', // Alias para desktop
    },
  },
  plugins: [],
}