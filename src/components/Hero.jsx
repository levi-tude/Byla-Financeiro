import React, { useEffect, useRef } from 'react'

const Hero = () => {
  const heroRef = useRef(null)

  useEffect(() => {
    const handleScroll = () => {
      if (heroRef.current) {
        const scrolled = window.pageYOffset
        heroRef.current.style.transform = `translateY(${scrolled * 0.5}px)`
      }
    }
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  const scrollToContact = () => {
    const element = document.getElementById('contato')
    if (element) element.scrollIntoView({ behavior: 'smooth' })
  }

  return (
    <section
      id="hero"
      className="relative h-screen flex items-center justify-center overflow-hidden"
      aria-label="Apresentação do Espaço Byla"
    >
      <div
        ref={heroRef}
        className="absolute inset-0 bg-gradient-to-b from-byla-ocean/30 to-byla-ocean-dark"
        style={{
          backgroundImage: `url('https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?ixlib=rb-4.0.3&auto=format&fit=crop&w=2073&q=80')`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundAttachment: 'fixed',
        }}
      >
        <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-black/25 to-byla-ocean-dark/90" />
      </div>

      <div className="relative z-10 text-center px-6 max-w-4xl mx-auto">
        <h1 className="font-display text-5xl md:text-7xl lg:text-8xl font-bold text-white mb-6 animate-fade-in">
          Espaço Byla
        </h1>
        <p className="text-xl md:text-2xl lg:text-3xl text-white/95 mb-8 font-light tracking-wide animate-fade-in-delay">
          Um ambiente amigável e familiar, criado para ser um ponto de encontro e realização de projetos
        </p>
        <p className="text-lg md:text-xl text-white/90 mb-12 font-light max-w-2xl mx-auto animate-fade-in-delay-2">
          A estrutura profissional encontra o acolhimento de um espaço de convivência. Stella Maris, Salvador.
        </p>
        <button
          onClick={scrollToContact}
          className="bg-white text-byla-ocean px-10 py-4 rounded-full text-lg font-semibold hover:bg-byla-sand-light transition-all duration-300 transform hover:scale-105 shadow-xl hover:shadow-2xl animate-fade-in-delay-3 focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-byla-ocean"
        >
          Entrar em contato
        </button>
      </div>

      <div className="absolute bottom-10 left-1/2 -translate-x-1/2 animate-bounce" aria-hidden="true">
        <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
        </svg>
      </div>

      <style>{`
        @keyframes fade-in {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-in { animation: fade-in 1s ease-out; }
        .animate-fade-in-delay { animation: fade-in 1s ease-out 0.3s both; }
        .animate-fade-in-delay-2 { animation: fade-in 1s ease-out 0.6s both; }
        .animate-fade-in-delay-3 { animation: fade-in 1s ease-out 0.9s both; }
      `}</style>
    </section>
  )
}

export default Hero
