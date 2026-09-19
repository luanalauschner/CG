# T1 — First-Person Action-Adventure · Castelo de Bodiam

Protótipo de FPAA desenvolvido em three.js, usando as bibliotecas do próprio
repositório (`../build`, `../libs/util/util.js`).

## Como executar

O projeto usa módulos ES, então precisa ser servido por HTTP (abrir o arquivo
direto com `file://` não funciona). A partir da raiz do repositório:

```
python3 -m http.server 8000
```

e abrir <http://localhost:8000/T1/T1.html>.

## Organização dos arquivos

O código foi dividido exatamente nas três frentes de trabalho previstas no
enunciado, além de um arquivo principal que apenas as conecta:

| Arquivo | Frente de trabalho | Conteúdo |
|---|---|---|
| `environment.js` | **Modelagem do Ambiente** | Muralhas, torres cilíndricas e quadradas, portaria, duas construções internas, escadas, ameias e as 3 portas animadas (classe `AnimatedDoor`). |
| `collision.js` | **Sistema de Colisão** | Classe `CollisionSystem`: registro dos volumes, resolução horizontal com deslize, gravidade, subida de degraus, apoio/teto e colisão dos projéteis. |
| `cameraShooting.js` | **Controle de câmera + Sistema de disparo** | Classe `CameraController` (1ª pessoa, orbital com a tecla `C`, mira) e classe `ShootingSystem` (arma cilíndrica, projéteis, cadência, remoção). |
| `main.js` | — | Monta a cena, a iluminação e o plano de chão, instancia os três módulos e roda o laço de renderização. |
| `T1.html` / `T1.css` | — | Página, painel de instruções e estilo da mira (crosshair). |

## Controles

| Ação | Teclas |
|---|---|
| Movimentação | `W` `A` `S` `D` e setas direcionais |
| Look at | Movimento do mouse |
| Disparo | Botão esquerdo ou direito do mouse |
| Câmera orbital (inspeção) | `C` |

## Onde testar cada requisito

- **Deslize nas paredes:** ande encostado em qualquer muralha ou contorne uma das
  torres cilíndricas dos cantos (elas colidem como cilindros, não como caixas).
- **Portas animadas:** o portão principal (grade que sobe) na entrada norte, e as
  portas dos *Alojamentos* (folha dupla, oeste do pátio) e da *Torre de Menagem*
  (folha única, leste do pátio).
- **Escadas:** as duas construções internas têm escada externa até o terraço; há
  ainda uma escada no pátio (lado oeste) que sobe até o caminho de ronda da
  muralha sul.
- **Queda suave:** é possível cair para dentro do pátio pela borda interna do
  caminho de ronda ou descer dos terraços.

## Notas de implementação

- Materiais criados com `setDefaultMaterial(cor)` e iluminação com
  `initDefaultBasicLight(scene)`, conforme exigido no enunciado.
- Toda a geometria usa apenas primitivas do three.js (`BoxGeometry` e
  `CylinderGeometry`); nenhum modelo é importado.
- O personagem é um cilindro vertical; o cenário é descrito por caixas alinhadas
  aos eixos e cilindros verticais. Ver o cabeçalho de `collision.js` para a
  descrição do algoritmo (inclusive do truque que faz a escada ser subida sem
  travamentos).
