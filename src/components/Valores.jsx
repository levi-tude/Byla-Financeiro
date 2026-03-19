import React from 'react'

const Valores = () => {
  const planos = [
    { nome: 'Atendimentos', avulso: 'R$ 65', turno: 'R$ 220 (55/h)', plano: 'R$ 35/h' },
    { nome: 'Movimento', avulso: 'R$ 120', turno: 'R$ 340 (85/h)', plano: 'R$ 60/h' },
    { nome: 'Sala do Teatro', avulso: 'R$ 220', turno: 'R$ 640 (160/h)', plano: 'R$ 100/h' },
  ]

  return (
    <section id="valores" className="py-24 md:py-32 bg-byla-sand-light" aria-labelledby="valores-heading">
      <div className="container mx-auto px-6">
        <div className="text-center mb-16">
          <h2 id="valores-heading" className="font-display text-4xl md:text-5xl lg:text-6xl text-byla-ocean mb-6">
            Valores para Locação
          </h2>
          <div className="w-24 h-1 bg-byla-warm mx-auto mb-8" aria-hidden="true" />
        </div>

        <div className="max-w-4xl mx-auto overflow-x-auto">
          <table className="w-full bg-white rounded-xl shadow-sm border border-byla-sand-dark/20" role="table" aria-label="Tabela de valores de locação">
            <thead>
              <tr className="border-b border-byla-sand-dark/30">
                <th scope="col" className="text-left py-4 px-6 font-display text-byla-ocean">Espaço</th>
                <th scope="col" className="text-left py-4 px-6 font-display text-byla-ocean">Avulso (1h)</th>
                <th scope="col" className="text-left py-4 px-6 font-display text-byla-ocean">Turno (4h)</th>
                <th scope="col" className="text-left py-4 px-6 font-display text-byla-ocean">Plano 10h+</th>
              </tr>
            </thead>
            <tbody>
              {planos.map((row, i) => (
                <tr key={i} className="border-b border-byla-sand-dark/20 last:border-0">
                  <td className="py-4 px-6 font-medium text-gray-800">{row.nome}</td>
                  <td className="py-4 px-6 text-gray-700">{row.avulso}</td>
                  <td className="py-4 px-6 text-gray-700">{row.turno}</td>
                  <td className="py-4 px-6 text-gray-700">{row.plano}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="text-center text-gray-600 font-light mt-8 max-w-2xl mx-auto text-sm md:text-base">
          * Valores para aulas, workshops e ensaios. Para pautas de eventos com público, consulte condições.
        </p>
      </div>
    </section>
  )
}

export default Valores
