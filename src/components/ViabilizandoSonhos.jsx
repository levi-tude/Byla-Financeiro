import React from 'react'

const ViabilizandoSonhos = () => {
  const scrollToContact = () => {
    const el = document.getElementById('contato')
    if (el) el.scrollIntoView({ behavior: 'smooth' })
  }

  return (
    <section id="viabilizando" className="py-24 md:py-32 bg-white" aria-labelledby="viabilizando-heading">
      <div className="container mx-auto px-6 max-w-3xl text-center">
        <h2 id="viabilizando-heading" className="font-display text-4xl md:text-5xl lg:text-6xl text-byla-ocean mb-6">
          Viabilizando Sonhos
        </h2>
        <div className="w-24 h-1 bg-byla-warm mx-auto mb-10" aria-hidden="true" />
        <p className="text-lg md:text-xl text-gray-700 leading-relaxed font-light mb-6">
          O Byla é um espaço focado em viabilizar ideias. Se você tem um projeto com alta recorrência ou que demande um formato diferenciado, estamos à disposição para entender sua necessidade.
        </p>
        <button
          onClick={scrollToContact}
          className="bg-byla-ocean text-white px-8 py-3 rounded-full font-semibold hover:bg-byla-ocean-dark transition-colors focus:outline-none focus:ring-2 focus:ring-byla-ocean focus:ring-offset-2"
        >
          Entrar em contato
        </button>
      </div>
    </section>
  )
}

export default ViabilizandoSonhos
