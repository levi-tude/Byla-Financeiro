import React from 'react'
import Header from './components/Header'
import Hero from './components/Hero'
import About from './components/About'
import Diferenciais from './components/Diferenciais'
import Salas from './components/Salas'
import Valores from './components/Valores'
import ViabilizandoSonhos from './components/ViabilizandoSonhos'
import Location from './components/Location'
import CTA from './components/CTA'
import Footer from './components/Footer'

function App() {
  return (
    <div className="min-h-screen bg-byla-sand-light">
      <Header />
      <main id="main-content">
        <Hero />
        <About />
        <Diferenciais />
        <Salas />
        <Valores />
        <ViabilizandoSonhos />
        <Location />
        <CTA />
      </main>
      <Footer />
    </div>
  )
}

export default App
