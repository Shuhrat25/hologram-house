import fs from 'node:fs'
import path from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

/**
 * Dev-эндпоинт для превью объектов: страница рисует модель, снимает кадр
 * и POST-ит сюда data-URL, а плагин кладёт его в public/thumbs/<id>.png.
 * Нужен только при пересъёмке превью, в прод-сборку не попадает.
 */
function thumbCapture(): Plugin {
  return {
    name: 'thumb-capture',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__thumb', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          return res.end('POST only')
        }
        const id = (req.url ?? '').replace(/^\//, '').replace(/[^a-z0-9_-]/gi, '')
        if (!id) {
          res.statusCode = 400
          return res.end('no id')
        }
        let body = ''
        req.on('data', (chunk) => (body += chunk))
        req.on('end', () => {
          const base64 = body.replace(/^data:image\/\w+;base64,/, '')
          const dir = path.resolve(import.meta.dirname, 'public/thumbs')
          fs.mkdirSync(dir, { recursive: true })
          fs.writeFileSync(path.join(dir, `${id}.png`), Buffer.from(base64, 'base64'))
          res.statusCode = 200
          res.end('ok')
        })
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), thumbCapture()],
})
