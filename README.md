# Espaço Byla – Site

Site do **Espaço Byla**, baseado no conteúdo do [site oficial no Google Sites](https://sites.google.com/view/espacobyla). Ambiente amigável e familiar em Stella Maris, Salvador – salas para atendimentos, movimento e teatro.

## Conteúdo do site

- **Hero:** Espaço Byla – ambiente amigável, ponto de encontro e realização de projetos
- **Sobre:** Apresentação do espaço
- **Nossa Estrutura:** Entrada acessível, lanchonete, espaço de convivência, banheiro com chuveiro, salas climatizadas
- **Nossas Salas:** Sala de Atendimentos (12m², até 4 pessoas), Sala Movimento (65m², até 16), Sala do Teatro (90m², até 70)
- **Valores para Locação:** Tabela com avulso (1h), turno (4h) e plano 10h+
- **Viabilizando Sonhos:** Projetos com recorrência ou formato diferenciado
- **Localização:** Rua Manuel Suarez, 54 – Stella Maris, Salvador – BA. Horário: Seg–Sáb 07:00–11:30 e 14:00–20:00
- **Contato:** WhatsApp, telefone, e-mail

## Tecnologias

- React 18, Vite, Tailwind CSS
- Fontes: Playfair Display, Inter

## Instalação e execução

```bash
npm install
npm run dev
```

Acesse `http://localhost:5173`.

## Build e deploy

```bash
npm run build
```

Saída em `dist/`. Deploy em Vercel, Netlify ou GitHub Pages (comando de build: `npm run build`, diretório: `dist`).

## Placeholders

Substitua no código antes de publicar:

- **WhatsApp e telefone:** links `wa.me` e `tel:` na seção Contato e no Footer
- **E-mail:** `contato@espacobyla.com.br` (ou o e-mail real)
- **Mapa:** URL do iframe do Google Maps em `Location.jsx` pelo embed do endereço real (Rua Manuel Suarez, 54, Stella Maris, Salvador)
