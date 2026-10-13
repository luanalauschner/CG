# Participantes do Trabalho
Luana Lauschner - lauschner.luana@estudante.ufjf.br
Arthur Lima - arthur.lanna@estudante.ufjf.br
Lucas Cioletti - Lucas.cioletti@estudante.ufjf.br

# T2 — First-Person Action-Adventure · Castelo de Bodiam

Continuação do T1 em three.js, usando apenas as bibliotecas do próprio
repositório (`../build`, `../libs/util/util.js`, `../libs/other/CSGMesh.js`).
Os modelos importados ficam em `T2/assets/objects/`.

## Como executar

O projeto usa módulos ES, então precisa ser servido por HTTP. A partir da raiz
do repositório:

```
python3 -m http.server 8000
```

e abrir <http://localhost:8000/T2/T2.html>.

## Organização dos arquivos

| Arquivo | Frente de trabalho | Conteúdo |
|---|---|---|
| `environment.js` | **Ambiente: ponte e elementos via CSG** | Castelo do T1 sobre uma ilha elevada; água (plano base); acesso externo (ponte → ilha octogonal → passadiço até a margem) em verde e areia; seteiras, pórtico e torres cilíndricas acessíveis feitos com CSG. |
| `interior.js` | **Interior do castelo** | Praça e aro da escotilha (CSG), 4 pedestais com luz pontual, escotilha de duas folhas e o portal animado. |
| `lighting.js` | **Iluminação e materiais** | Sistema dia (10h, Sol) / noite (18h, Lua), luz principal com sombra, luz de preenchimento oposta sem sombra, luz ambiente, neblina e disco do Sol/Lua. |
| `enemies.js` | **Inimigos** | Carregamento dos modelos OBJ/MTL, conversão para Lambert, patrulha, luz pontual, barra de energia, dano e desaparecimento por opacidade. |
| `keys.js` | **Chaves** | Chaves (esferas Phong emissivas), coleta por proximidade, HUD, tecla `K` e posicionamento nos pedestais. |
| `cameraShooting.js` | **Câmera + armas** | Câmera em 1ª pessoa (corrida, pulo, câmera orbital) e a besta com os dardos. |
| `collision.js` | Sistema de colisão (T1) | Agora com colisores que só afetam o jogador (barreiras na beira d'água). |
| `main.js` | — | Monta a cena, conecta os módulos e roda o laço de renderização. |
| `T2.html` / `T2.css` | — | Página, mira, barra de recarga e HUD das chaves. |

## Controles

| Ação | Teclas |
|---|---|
| Movimentação | `W` `A` `S` `D` e setas direcionais |
| Correr | `SHIFT` (segurar) |
| Pular | `ESPAÇO` |
| Olhar | Movimento do mouse |
| Disparo da besta | Botão esquerdo ou direito do mouse (com tempo de recarga) |
| Dia / noite | `H` |
| Pegar todas as chaves / voltar às chaves anteriores | `K` |
| Câmera orbital (inspeção) | `C` |

> O enunciado diz "pressionando 'C' novamente" na descrição da tecla `K`; como `C`
> já é a câmera orbital, o retorno às chaves anteriores é feito apertando `K` de novo.

## Itens do T2

### Inimigos e chaves
- Dois modelos importados (`Florest_Guardian` — monstro-árvore que se arrasta,
  morre com **5** disparos; `BlueDragon` — dragão que voa, morre com **3**), dois
  de cada.
- Posições: um dragão no **caminho de ronda da muralha oeste**, um guardião
  **dentro dos alojamentos**, um dragão e um guardião no pátio.
- Cada inimigo tem uma luz pontual colorida (verde / azul) de baixa intensidade e
  uma barra de energia que sempre fica de frente para a câmera.
- Ao zerar a energia, o inimigo some com uma transição de opacidade e solta uma
  **chave** (esfera `MeshPhongMaterial` com `emissive`), coletada ao chegar perto.
- Os inimigos só aparecem à **noite**.

### Interior do castelo
- Praça circular com a escotilha e 4 pedestais. Chegando perto de um pedestal
  com chave, ela é posicionada sobre ele e a luz pontual dele acende.
- Com as 4 chaves, as folhas da escotilha se abrem e o portal (poço recortado na
  ilha via CSG) brilha.

### Ambiente
- **Ilha e acesso:** a ilha do castelo tem o topo em `y = 0`; o acesso fica em
  `y = -0.2` (alturas diferentes, sem Z-fighting) e a água em `y = -2`
  (unidades do castelo). Barreiras invisíveis impedem cair na água.
- **Seteiras (CSG):** arco com base reta e topo arredondado (`arcoCSG`). Nas
  muralhas o corte atravessa a parede; em sólidos maciços (torres) vira um nicho
  com fundo escuro.
- **Pórtico (CSG):** túnel em arco recortado no bloco central da portaria, com
  arquivolta (arco maior − arco menor).
- **Torres cilíndricas acessíveis (CSG):** câmara interna no nível do caminho de
  ronda, duas portas em arco (uma para cada muralha), escada interna, alçapão na
  laje e terraço no topo com parapeito. As torres também ligam os caminhos de
  ronda das muralhas que se encontram nelas.

### Iluminação e materiais
- Luz direcional principal (Sol às 10h / Lua às 18h) com sombra em todos os
  elementos; luz direcional de preenchimento oposta, sem sombra; luz ambiente
  fraca.
- Sombras: mapa 4096×4096 (PCF) com o frustum restrito ao castelo.
- Todos os objetos usam `MeshLambertMaterial`, exceto as chaves
  (`MeshPhongMaterial` com `emissive`).

### Interação
- Personagem um pouco mais alto que no T1 (altura 2,1; olhos a 1,95).
- `SHIFT`: aceleração suave até 1,75× a velocidade e leve abertura do FOV.
- `ESPAÇO`: pulo com *coyote time* e *buffer*, pequena "afundada" ao aterrissar.
