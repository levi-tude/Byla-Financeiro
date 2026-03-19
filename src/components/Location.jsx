import React from 'react'

const ENDERECO = 'Rua Manuel Suarez, 54 - Stella Maris, Salvador - BA, 41600-620'
const MAPS_EMBED = 'https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3890.324789!2d-38.45!3d-12.95!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x0%3A0x0!2zMTLCsDU3JzAwLjAiUyAzOMKwMjcnMDAuMCJX!5e0!3m2!1spt-BR!2sbr!4v1'
const MAPS_LINK = 'https://www.google.com/maps/search/?api=1&query=Rua+Manuel+Suarez+54+Stella+Maris+Salvador+BA'

const Location = () => (
  <section id="localizacao" className="py-24 md:py-32 bg-gradient-to-b from-white to-byla-sand-light" aria-labelledby="localizacao-heading">
    <div className="container mx-auto px-6">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-16">
          <h2 id="localizacao-heading" className="font-display text-4xl md:text-5xl lg:text-6xl text-byla-ocean mb-6">
            Onde estamos
          </h2>
          <div className="w-24 h-1 bg-byla-warm mx-auto mb-8" aria-hidden="true" />
          <p className="text-xl text-gray-700 font-light">
            Stella Maris: em um dos bairros mais agradáveis de Salvador, pertinho da rua principal.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-12 items-start">
          <div className="space-y-6">
            <div className="flex items-start gap-4">
              <span className="text-byla-ocean text-2xl" aria-hidden="true">📍</span>
              <div>
                <p className="font-semibold text-gray-800">Endereço</p>
                <a
                  href={MAPS_LINK}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-gray-600 font-light hover:text-byla-ocean transition-colors"
                >
                  {ENDERECO}
                </a>
              </div>
            </div>
            <div className="flex items-start gap-4">
              <span className="text-byla-ocean text-2xl" aria-hidden="true">🕐</span>
              <div>
                <p className="font-semibold text-gray-800">Horário de funcionamento</p>
                <p className="text-gray-600 font-light">
                  Segunda a sábado: 07:00 – 11:30 e 14:00 – 20:00
                </p>
              </div>
            </div>
          </div>

          <div className="relative h-80 md:h-96 rounded-xl overflow-hidden shadow-xl">
            <iframe
              title="Localização do Espaço Byla - Rua Manuel Suarez, Stella Maris, Salvador"
              src={MAPS_EMBED}
              width="100%"
              height="100%"
              style={{ border: 0 }}
              allowFullScreen=""
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              className="absolute inset-0"
            />
          </div>
        </div>
      </div>
    </div>
  </section>
)

export default Location
