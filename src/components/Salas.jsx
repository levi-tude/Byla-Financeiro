import React from 'react'

const Salas = () => {
  const salas = [
    {
      title: 'Sala de Atendimentos',
      ideal: 'Fisioterapia, massagens, atendimentos psicológicos e aulas de música individuais.',
      equipamentos: 'Equipada com maca, pia, armário, mesa e cadeiras.',
      capacidade: 'Até 04 pessoas',
      tamanho: '12m²',
    },
    {
      title: 'Sala Movimento',
      ideal: 'Yoga, dança, funcional, práticas terapêuticas em grupo e ensaios.',
      equipamentos: 'Piso de alto impacto/vinílico, espelhos amplos e ventilação externa.',
      capacidade: 'Até 16 pessoas',
      tamanho: '65m²',
    },
    {
      title: 'Sala do Teatro',
      ideal: 'Workshops, cursos, ensaios artísticos e atividades culturais.',
      equipamentos: 'Tablado de 50m², espelhos, barra, cortina e sala de apoio/camarim.',
      capacidade: 'Até 70 pessoas',
      tamanho: '90m²',
    },
  ]

  return (
    <section id="salas" className="py-24 md:py-32 bg-white" aria-labelledby="salas-heading">
      <div className="container mx-auto px-6">
        <div className="text-center mb-20">
          <h2 id="salas-heading" className="font-display text-4xl md:text-5xl lg:text-6xl text-byla-ocean mb-6">
            Nossas Salas
          </h2>
          <div className="w-24 h-1 bg-byla-warm mx-auto mb-8" aria-hidden="true" />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl mx-auto">
          {salas.map((sala, i) => (
            <article
              key={i}
              className="bg-byla-sand-light/60 border border-byla-sand-dark/20 rounded-2xl p-8 hover:shadow-lg transition-shadow"
            >
              <h3 className="font-display text-2xl text-byla-ocean mb-4">{sala.title}</h3>
              <p className="text-gray-700 font-light mb-4">
                <span className="font-medium text-gray-800">Ideal para: </span>
                {sala.ideal}
              </p>
              <p className="text-gray-600 text-sm font-light mb-4">{sala.equipamentos}</p>
              <ul className="space-y-1 text-sm text-byla-ocean font-medium">
                <li>👥 {sala.capacidade}</li>
                <li>📐 {sala.tamanho}</li>
              </ul>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}

export default Salas
