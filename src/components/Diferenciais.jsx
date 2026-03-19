import React from 'react'

const Diferenciais = () => {
  const items = [
    { icon: '♿', label: 'Entrada Acessível' },
    { icon: '☕', label: 'Lanchonete no Local' },
    { icon: '🛋️', label: 'Espaço de Convivência' },
    { icon: '🚿', label: 'Banheiro com Chuveiro' },
    { icon: '❄️', label: 'Salas Climatizadas' },
  ]

  return (
    <section id="diferenciais" className="py-20 md:py-28 bg-byla-sand-light" aria-labelledby="diferenciais-heading">
      <div className="container mx-auto px-6">
        <div className="text-center mb-14">
          <h2 id="diferenciais-heading" className="font-display text-3xl md:text-4xl lg:text-5xl text-byla-ocean mb-6">
            Nossa Estrutura
          </h2>
          <div className="w-24 h-1 bg-byla-warm mx-auto mb-6" aria-hidden="true" />
        </div>

        <ul className="flex flex-wrap justify-center gap-6 md:gap-10 max-w-4xl mx-auto">
          {items.map((item, i) => (
            <li
              key={i}
              className="flex items-center gap-3 bg-white px-6 py-4 rounded-xl shadow-sm border border-byla-sand-dark/20 hover:shadow-md transition-shadow"
            >
              <span className="text-2xl" aria-hidden="true">{item.icon}</span>
              <span className="font-medium text-gray-800">{item.label}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

export default Diferenciais
