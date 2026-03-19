import React from 'react'

const ENDERECO = 'Rua Manuel Suarez, 54 - Stella Maris, Salvador - BA, 41600-620'

const Footer = () => {
  const scrollTo = (id) => {
    const el = document.getElementById(id)
    if (el) el.scrollIntoView({ behavior: 'smooth' })
  }

  const links = [
    { id: 'sobre', label: 'Sobre' },
    { id: 'salas', label: 'Salas' },
    { id: 'valores', label: 'Valores' },
    { id: 'localizacao', label: 'Localização' },
    { id: 'contato', label: 'Contato' },
  ]

  return (
    <footer className="bg-byla-ocean-dark text-white py-12">
      <div className="container mx-auto px-6">
        <div className="grid md:grid-cols-3 gap-8 mb-8">
          <div>
            <h3 className="font-display text-2xl mb-4">Espaço Byla</h3>
            <p className="text-white/80 font-light text-sm">
              Um ambiente amigável e familiar. Ponto de encontro e realização de projetos em Stella Maris, Salvador.
            </p>
          </div>

          <div>
            <h4 className="font-semibold mb-4">Navegação</h4>
            <ul className="space-y-2 text-white/80 font-light text-sm">
              {links.map(({ id, label }) => (
                <li key={id}>
                  <button type="button" onClick={() => scrollTo(id)} className="hover:text-white transition-colors text-left">
                    {label}
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="font-semibold mb-4">Contato</h4>
            <p className="text-white/80 font-light text-sm mb-2">{ENDERECO}</p>
            <p className="text-white/80 font-light text-sm">Seg–Sáb: 07:00–11:30 e 14:00–20:00</p>
            <div className="flex gap-4 mt-4">
              <a href="https://wa.me/5571000000000" target="_blank" rel="noopener noreferrer" className="text-white/80 hover:text-white transition-colors" aria-label="WhatsApp">WhatsApp</a>
              <a href="mailto:contato@espacobyla.com.br" className="text-white/80 hover:text-white transition-colors break-all">E-mail</a>
            </div>
          </div>
        </div>

        <div className="border-t border-white/20 pt-8 flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-white/60 text-sm font-light">
            &copy; {new Date().getFullYear()} Espaço Byla. Todos os direitos reservados.
          </p>
          <button
            type="button"
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            className="text-white/80 hover:text-white transition-colors flex items-center gap-2 font-light text-sm"
          >
            Voltar ao topo
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
            </svg>
          </button>
        </div>
      </div>
    </footer>
  )
}

export default Footer
