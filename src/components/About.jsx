import React from 'react'

const About = () => (
  <section id="sobre" className="py-24 md:py-32 bg-white" aria-labelledby="sobre-heading">
    <div className="container mx-auto px-6 max-w-4xl">
      <div className="text-center mb-16">
        <h2 id="sobre-heading" className="font-display text-4xl md:text-5xl lg:text-6xl text-byla-ocean mb-6">
          Sobre o Byla
        </h2>
        <div className="w-24 h-1 bg-byla-warm mx-auto mb-8" aria-hidden="true" />
      </div>

      <div className="space-y-6 text-lg md:text-xl text-gray-700 leading-relaxed text-center">
        <p className="font-light">
          Um ambiente amigável e familiar, criado para ser um ponto de encontro e realização de projetos.
        </p>
        <p className="font-light">
          Aqui, a estrutura profissional encontra o acolhimento de um espaço de convivência.
        </p>
      </div>
    </div>
  </section>
)

export default About
