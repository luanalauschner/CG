# Participantes do Trabalho
Luana Lauschner - lauschner.luana@estudante.ufjf.br
Arthur Lima - arthur.lanna@estudante.ufjf.br
Lucas Cioletti - Lucas.cioletti@estudante.ufjf.br

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
