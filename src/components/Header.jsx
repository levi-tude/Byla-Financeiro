import React, { useState, useEffect } from 'react'

const Header = () => {
  const [isScrolled, setIsScrolled] = useState(false)
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 50)
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  const scrollToSection = (id) => {
    const element = document.getElementById(id)
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' })
      setIsMobileMenuOpen(false)
    }
  }

  const navItems = [
    { id: 'sobre', label: 'Sobre' },
    { id: 'diferenciais', label: 'Estrutura' },
    { id: 'salas', label: 'Salas' },
    { id: 'valores', label: 'Valores' },
    { id: 'viabilizando', label: 'Viabilizando Sonhos' },
    { id: 'localizacao', label: 'Localização' },
    { id: 'contato', label: 'Contato' },
  ]

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        isScrolled ? 'bg-white/95 backdrop-blur-md shadow-sm' : 'bg-transparent'
      }`}
    >
      <nav className="container mx-auto px-6 py-6" aria-label="Navegação principal">
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => scrollToSection('hero')}
            className="text-2xl font-display font-bold text-byla-ocean cursor-pointer hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-byla-ocean focus:ring-offset-2 rounded"
          >
            Espaço Byla
          </button>

          <div className="hidden md:flex items-center gap-8">
            {navItems.map(({ id, label }) => (
              <button
                key={id}
                type="button"
                onClick={() => scrollToSection(id)}
                className={`font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-byla-ocean focus:ring-offset-2 rounded ${
                  id === 'contato'
                    ? 'bg-byla-ocean text-white px-5 py-2 rounded-full hover:bg-byla-ocean-dark'
                    : 'text-gray-700 hover:text-byla-ocean'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <button
            type="button"
            className="md:hidden text-byla-ocean p-2 focus:outline-none focus:ring-2 focus:ring-byla-ocean rounded"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            aria-expanded={isMobileMenuOpen}
            aria-label="Abrir ou fechar menu"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {isMobileMenuOpen ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>
        </div>

        {isMobileMenuOpen && (
          <div className="md:hidden mt-6 pb-4 space-y-2">
            {navItems.map(({ id, label }) => (
              <button
                key={id}
                type="button"
                onClick={() => scrollToSection(id)}
                className={`block w-full text-left py-2 px-3 rounded font-medium transition-colors ${
                  id === 'contato' ? 'bg-byla-ocean text-white text-center' : 'text-gray-700 hover:text-byla-ocean'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </nav>
    </header>
  )
}

export default Header
