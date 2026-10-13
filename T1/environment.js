/**
 * =====================================================================================
 *  T2 - MODELAGEM DO AMBIENTE
 * =====================================================================================
 *  Novidades do T2 (frente "Ambiente - Ponte e elementos criados via CSG"):
 *    - Castelo sobre uma ILHA elevada em relação ao plano base (água);
 *    - ACESSO externo (ponte -> ilha octogonal -> passadiço até a margem), em verde
 *      e areia, em altura ligeiramente diferente da ilha (evita Z-fighting);
 *    - SETEIRAS (base reta + topo arredondado) recortadas via CSG nas muralhas e
 *      torres;
 *    - PÓRTICO do portão principal recortado via CSG (túnel em arco + arquivolta);
 *    - TORRES CILÍNDRICAS ACESSÍVEIS: portas em arco (CSG) a partir do caminho de
 *      ronda, câmara interna, escada e alçapão (CSG) até o terraço no topo.
 * =====================================================================================
 */

import * as THREE from 'three';
import { setDefaultMaterial } from '../libs/util/util.js';
import { CSG } from '../libs/other/CSGMesh.js';
import { STEP_HEIGHT } from './collision.js';

// =====================================================================================
// DIMENSÕES GERAIS DO CASTELO
// =====================================================================================
const MURALHA = {
   meio:      40,   // distância do centro até a linha média de cada muralha
   espessura:  4,   // espessura da muralha (também é a largura do caminho de ronda)
   altura:    25    // altura do topo da muralha (piso do caminho de ronda)
};
const FACE_INT = MURALHA.meio - MURALHA.espessura / 2; // 38 - face interna
const FACE_EXT = MURALHA.meio + MURALHA.espessura / 2; // 42 - face externa

// Fator de escala geral do castelo
// O jogador não é afetado - por isso o castelo fica maior/menor EM RELAÇÃO a ele.
export const ESCALA = 1.6;

// Ameias: o vão entre merlões, já multiplicado por ESCALA, precisa ser menor que
// o diâmetro do jogador (1.0 unidade de mundo) para que ele não consiga passar
// por entre as ameias e cair fora do previsto (0.55 * 1.6 = 0.88 < 1.0).
const MERLAO = { largura: 1.8, vaoMax: 0.55, altura: 1.4, espessura: 0.8 };

const PORTAO = { meiaLargura: 4, altura: 10 };  // vão da entrada principal
const TORRE_CANTO = { raio: 8.5, altura: 30 }; // torres cilíndricas

// Torres cilíndricas ACESSÍVEIS (T2). Medidas em unidades do castelo:
//   piso da câmara = altura do caminho de ronda (entra-se pela muralha);
//   laje entre yTeto e yTerraco, com um alçapão por onde passa a escada;
//   terraço no topo, cercado por um parapeito de (raio - rTerraco) de espessura.
const TORRE_ACESSO = {
   rCamara:  6.5,  // raio interno da câmara (paredes de 2 unidades)
   yTeto:    28,   // face inferior da laje
   yTerraco: 29.4, // piso do terraço (face superior da laje): parapeito na altura da cintura
   rTerraco: 7.5,  // raio interno do parapeito do terraço
   porta: { largura: 2.0, alturaReta: 1.9 } // porta em arco (topo = 25 + 1.9 + 1.0)
};

// Seteiras: base reta e topo em semicírculo (raio = largura / 2)
const SETEIRA = { largura: 0.6, alturaReta: 2.0, yParede: 11 };

// Ilha onde o castelo está assentado e nível da água (plano base).
// A ilha tem o topo em y = 0, então TODO o castelo continua sendo modelado a
// partir de y = 0, mas agora fica acima do plano base (água).
export const NIVEL_AGUA = -2.0;
const ILHA = { x0: -62, x1: 62, z0: -60, z1: 62, yBase: -6 };

// Acesso externo: fica um pouco mais BAIXO que a ilha do castelo (topo em
// -0.2), para os dois elementos não ficarem coplanares (Z-fighting). A trilha
// de areia fica, por sua vez, um pouco acima do gramado do acesso.
const ACESSO = { yTopo: -0.2, yAreia: -0.08 };

// Escotilha circular do portal (interior do castelo, ver interior.js).
// O poço sob a escotilha é recortado da ilha via CSG nesta função.
export const ESCOTILHA = { x: 0, z: 20, raio: 3.0, profundidade: 2.2 };

// Padrão de degrau usado nas duas escadas internas do castelo (mesma
// proporção de SUBIDA nas duas - o piso/profundidade de cada uma é calculado
// à parte, ver construirAlojamentos()/construirTorreDeMenagem(), porque cada
// escada precisa terminar exatamente na abertura do parapeito do seu prédio).
//
// 'espelhoAlvo' é derivado de STEP_HEIGHT (o degrau máximo que o personagem
// sobe sem travar, ver collision.js): o "* ESCALA" no denominador cancela a
// escala do castelo, então a subida real (em unidades de MUNDO) é sempre
// 0.6 * STEP_HEIGHT (60% do máximo) - com folga confortável, mas sem exagerar
// na quantidade de degraus.
const DEGRAU = {
   espelhoAlvo: (STEP_HEIGHT / ESCALA) * 0.6
};

/** Quantidade de degraus para vencer 'alturaTotal' usando o degrau-alvo do castelo. */
function contarDegraus(alturaTotal) {
   return Math.max(1, Math.ceil(alturaTotal / DEGRAU.espelhoAlvo));
}

// =====================================================================================
// FUNÇÃO PRINCIPAL
// =====================================================================================
/**
 * Cria todo o cenário e registra os volumes de colisão.
 *
 * @param {THREE.Scene} scene cena principal
 * @param {CollisionSystem} collision sistema de colisão (ver collision.js)
 * @returns {{group:THREE.Group, doors:AnimatedDoor[], update:Function}}
 */
export function createCastle(scene, collision) {

   const castelo = new THREE.Group();
   scene.add(castelo);

   // Aplica o fator de escala geral a TODO o castelo (única variável a mudar
   // para deixá-lo maior/menor). A matriz é forçada agora, antes de criar
   // qualquer peça, para que os colisores (calculados a partir da posição
   // "mundo" de cada malha) já nasçam com o tamanho correto.
   castelo.scale.setScalar(ESCALA);
   castelo.updateMatrixWorld(true);

   // ----------------------------------------------------------------------------
   // MATERIAIS
   // ----------------------------------------------------------------------------
   const matPedra    = setDefaultMaterial("rgb(248, 217, 163)"); // muralhas, alvenaria da portaria e moldura do portão
   const matPedraEsc = setDefaultMaterial("rgb(255, 234, 197)"); // torres (canto/quadradas), cordão decorativo, calçada e corpo do poço
   const matAmeia    = setDefaultMaterial("rgb(255, 220, 160)"); // merlões (muralhas, torres e terraços)
   const matDegrau   = setDefaultMaterial("rgb(140,134,124)"); // degraus e muretas das escadas
   const matPredio   = setDefaultMaterial("rgb(176,168,152)"); // paredes/lajes das duas construções internas
   const matTelhado  = setDefaultMaterial("rgb(122,62,48)");   // telhado do poço
   const matMadeira  = setDefaultMaterial("rgb(104,66,38)");   // folhas de porta, mobiliário (caixotes/barris) e estrutura do poço
   const matFerro    = setDefaultMaterial("rgb(62, 62, 68)");    // grade do portão e travessas de reforço das portas de madeira
   const matVao      = setDefaultMaterial("rgb(53, 42, 30)");    // aberturas escuras: fundo das seteiras, janelas, vãos decorativos e interior do poço
   const matGrama    = setDefaultMaterial("rgb(98,142,72)");     // ilha do castelo e gramado do acesso
   const matGramaAc  = setDefaultMaterial("rgb(110,150,78)");    // gramado do acesso (verde um pouco mais claro que a ilha)
   const matAreia    = setDefaultMaterial("rgb(222,196,140)");   // trilha de areia do acesso
   const matAgua     = setDefaultMaterial("rgb(58,104,148)");    // plano base (água do fosso)

   const doors = []; // portas animadas criadas ao longo da modelagem

   // ============================================================================
   // FERRAMENTAS DE CONSTRUÇÃO
   // ============================================================================

   // Cache de geometrias por dimensão: o castelo repete MUITAS peças do mesmo
   // tamanho (merlões, degraus, faixas decorativas, barris...). Reaproveitar a
   // mesma BoxGeometry/CylinderGeometry entre meshes idênticos evita centenas
   // de buffers de geometria duplicados na GPU - cada mesh mantém sua própria
   // posição/matriz, então o colisor (calculado por Box3.setFromObject, que
   // usa a matriz de mundo) não é afetado pela geometria ser compartilhada.
   const geoCacheBox = new Map();
   const geoCacheCil = new Map();

   /**
    * Devolve uma BoxGeometry para as dimensões dadas, reaproveitando do cache
    * quando já existe uma peça igual (mesma largura/altura/profundidade).
    */
   function geometriaBox(largura, altura, profundidade) {
      const chave = `${largura.toFixed(6)}|${altura.toFixed(6)}|${profundidade.toFixed(6)}`;
      let geo = geoCacheBox.get(chave);
      if (!geo) {
         geo = new THREE.BoxGeometry(largura, altura, profundidade);
         geoCacheBox.set(chave, geo);
      }
      return geo;
   }

   /**
    * Devolve uma CylinderGeometry (raio igual no topo/base) para as dimensões
    * dadas, reaproveitando do cache quando já existe uma peça igual.
    */
   function geometriaCilindro(raio, altura, lados) {
      const chave = `${raio.toFixed(6)}|${altura.toFixed(6)}|${lados}`;
      let geo = geoCacheCil.get(chave);
      if (!geo) {
         geo = new THREE.CylinderGeometry(raio, raio, altura, lados);
         geoCacheCil.set(chave, geo);
      }
      return geo;
   }

   /**
    * Cria um paralelepípedo a partir dos seus LIMITES (mínimo/máximo em cada eixo).
    * Trabalhar com limites (e não com centro+tamanho) deixa o código do layout
    * muito mais legível e faz o registro do colisor ser exato.
    *
    * @param {number} x0,x1 limites mínimo/máximo no eixo X
    * @param {number} y0,y1 limites mínimo/máximo no eixo Y (altura)
    * @param {number} z0,z1 limites mínimo/máximo no eixo Z
    * @param {THREE.Material} material material (sempre criado via setDefaultMaterial)
    * @param {boolean} colide se false, é apenas decoração (não entra na colisão)
    * @returns {THREE.Mesh} a malha criada (já adicionada ao grupo "castelo")
    */
   function bloco(x0, x1, y0, y1, z0, z1, material, colide = true) {
      const geo = geometriaBox(x1 - x0, y1 - y0, z1 - z0);
      const mesh = new THREE.Mesh(geo, material);
      mesh.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
      castelo.add(mesh);
      if (colide) collision.addBox(mesh);
      return mesh;
   }

   /**
    * Cria um cilindro vertical (torres, poço, barris).
    *
    * @param {number} raio raio do cilindro (constante do topo à base)
    * @param {number} altura altura total do cilindro
    * @param {number} x,z centro do cilindro no plano horizontal
    * @param {number} yBase base do cilindro
    * @param {THREE.Material} material material (sempre criado via setDefaultMaterial)
    * @param {boolean} colide se false, é apenas decoração (não entra na colisão)
    * @param {number} lados nº de segmentos radiais (suavidade do cilindro)
    * @returns {THREE.Mesh} a malha criada (já adicionada ao grupo "castelo")
    */
   function cilindro(raio, altura, x, yBase, z, material, colide = true, lados = 28) {
      const geo = geometriaCilindro(raio, altura, lados);
      const mesh = new THREE.Mesh(geo, material);
      mesh.position.set(x, yBase + altura / 2, z);
      castelo.add(mesh);
      // addCylinder recebe o raio em coordenadas de MUNDO: como o colisor não
      // é recalculado a partir da geometria (só x/z/minY/maxY vêm da caixa
      // envolvente), o raio precisa ser escalado manualmente aqui.
      if (colide) collision.addCylinder(mesh, raio * ESCALA);
      return mesh;
   }

   /**
    * Cria uma fileira de ameias (merlões) alternando bloco/vão, preenchendo
    * EXATAMENTE o intervalo [de, ate] (o primeiro merlão começa em 'de' e o
    * último termina em 'ate').
    *
    * Detalhe importante para a jogabilidade: a quantidade de merlões é escolhida
    * de forma que nenhum vão fique maior que MERLAO.vaoMax. Como o diâmetro do
    * cilindro de colisão do jogador é 1.0 unidade, ele nunca consegue escapar por
    * entre as ameias - as únicas saídas são as previstas no projeto (as bordas
    * internas do caminho de ronda).
    *
    * Trechos sem ameias (torres, chegada de escadas) são obtidos chamando esta
    * função uma vez para cada intervalo contíguo.
    *
    * @param {string} eixo   'x' (fileira ao longo de X) ou 'z'
    * @param {number} f0,f1  limites no eixo perpendicular (espessura do merlão)
    * @param {number} de,ate intervalo preenchido pela fileira
    * @param {number} y0,y1  base e topo dos merlões
    */
   function fileiraDeMerloes(eixo, f0, f1, de, ate, y0, y1, material) {
      const vaoTotal = ate - de;
      if (vaoTotal <= 0.01) return;

      // Menor quantidade de merlões que mantém todos os vãos <= vaoMax:
      //   (vaoTotal - qtd*largura) / (qtd - 1) <= vaoMax
      const qtd = Math.max(1, Math.ceil((vaoTotal + MERLAO.vaoMax) /
                                        (MERLAO.largura + MERLAO.vaoMax)));

      // Trecho curto demais para ter ameias: vira um bloco maciço
      if (qtd === 1) {
         if (eixo === 'x') bloco(de, ate, y0, y1, f0, f1, material);
         else              bloco(f0, f1, y0, y1, de, ate, material);
         return;
      }

      const largura = Math.min(MERLAO.largura, vaoTotal / qtd);
      const vao     = (vaoTotal - qtd * largura) / (qtd - 1);

      for (let i = 0; i < qtd; i++) {
         const a = de + i * (largura + vao);
         const b = a + largura;
         if (eixo === 'x') bloco(a, b, y0, y1, f0, f1, material);
         else              bloco(f0, f1, y0, y1, a, b, material);
      }
   }

   /**
    * 
    * Cria uma escada visual para representar os locais onde o jogador pode subir.
    *
    * @param {Object} p
    *   p.eixo     'x' ou 'z' : eixo em que a escada avança
    *   p.inicio   coordenada do pé da escada nesse eixo
    *   p.sentido  +1 ou -1 : sentido da subida
    *   p.lat0/lat1 limites laterais (no outro eixo horizontal)
    *   p.baseY    altura do piso onde a escada começa
    *   p.degraus  número de degraus
    *   p.espelho  altura de cada degrau (subida)
    *   p.piso     profundidade de cada degrau (avanço)
    *   p.mureta   altura da mureta lateral (0 = sem mureta)
    *   p.muretas  [bool,bool] indica em quais lados a mureta é construída.
    *              Onde a escada encosta em um prédio a mureta é omitida, senão
    *              ela fecharia a passagem de chegada ao terraço.
    */
   function escada(p) {
      const mureta  = p.mureta || 0;
      const lados   = p.muretas || [true, true];
      const espMur  = 1.0; // espessura da mureta lateral

      for (let i = 0; i < p.degraus; i++) {
         const a = p.inicio + p.sentido * (i * p.piso);
         const b = p.inicio + p.sentido * ((i + 1) * p.piso);
         const de  = Math.min(a, b), ate = Math.max(a, b);
         const topo = p.baseY + (i + 1) * p.espelho;

         if (p.eixo === 'x') {
            bloco(de, ate, p.baseY, topo, p.lat0, p.lat1, matDegrau, false);
            if (mureta > 0 && lados[0])
               bloco(de, ate, topo, topo + mureta, p.lat0 - espMur, p.lat0, matDegrau);
            if (mureta > 0 && lados[1])
               bloco(de, ate, topo, topo + mureta, p.lat1, p.lat1 + espMur, matDegrau);
         } else {
            bloco(p.lat0, p.lat1, p.baseY, topo, de, ate, matDegrau, false);
            if (mureta > 0 && lados[0])
               bloco(p.lat0 - espMur, p.lat0, topo, topo + mureta, de, ate, matDegrau);
            if (mureta > 0 && lados[1])
               bloco(p.lat1, p.lat1 + espMur, topo, topo + mureta, de, ate, matDegrau);
         }
      }
   }

   /**
    * Cria uma "rampa" invisível usando centenas de micro-degraus.
    * Como as caixas são retas, o sistema AABB do collision.js funciona perfeitamente,
    * e como os degraus são minúsculos, a câmera desliza sem tremer.
    */
   function rampaInvisivel(p) {
      const avancoTotal = p.degraus * p.piso;
      const alturaTotal = p.degraus * p.espelho;

      // Define que cada micro-degrau terá um avanço muito pequeno
      const tamanhoMicroPiso = 0.15;
      const qtdMicroDegraus = Math.ceil(Math.abs(avancoTotal) / tamanhoMicroPiso);
      
      const microPiso = Math.abs(avancoTotal) / qtdMicroDegraus;
      const microEspelho = alturaTotal / qtdMicroDegraus;

      for (let i = 0; i < qtdMicroDegraus; i++) {
         const a = p.inicio + p.sentido * (i * microPiso);
         const b = p.inicio + p.sentido * ((i + 1) * microPiso);
         const de = Math.min(a, b);
         const ate = Math.max(a, b);
         
         const baseDegrau = p.baseY;
         const topoDegrau = p.baseY + ((i + 1) * microEspelho);

         let meshInvisivel;
         if (p.eixo === 'x') {
            // Usa a própria função bloco(), que já registra a colisão no collision.js
            meshInvisivel = bloco(de, ate, baseDegrau, topoDegrau, p.lat0, p.lat1, matDegrau);
         } else {
            meshInvisivel = bloco(p.lat0, p.lat1, baseDegrau, topoDegrau, de, ate, matDegrau);
         }
         
         // Esconde o micro-degrau da visão do jogador
         meshInvisivel.visible = false;
      }
   }

   /**
    * Cria uma parede com um vão de porta no meio: duas laterais + verga em cima.
    * O vão fica entre 'vao0' e 'vao1' e tem 'alturaVao' de altura livre.
    *
    * @param {string} eixo 'x' se a parede é perpendicular a X (vão medido em Z), senão 'z'
    * @param {number} e0,e1  limites da parede no eixo perpendicular (sua espessura)
    * @param {number} y0,y1  base e topo da parede
    * @param {number} l0,l1  limites totais da parede no eixo do vão (largura da parede)
    * @param {number} vao0,vao1 limites do vão (porta), dentro do intervalo [l0,l1]
    * @param {number} alturaVao altura livre do vão, a partir de y0 (acima disso entra a verga)
    * @param {THREE.Material} material material das três partes (laterais + verga)
    */
   function paredeComVao(eixo, e0, e1, y0, y1, l0, l1, vao0, vao1, alturaVao, material) {
      if (eixo === 'x') {
         bloco(e0, e1, y0, y1, l0, vao0, material);            // lateral 1
         bloco(e0, e1, y0, y1, vao1, l1, material);            // lateral 2
         bloco(e0, e1, y0 + alturaVao, y1, vao0, vao1, material); // verga
      } else {
         bloco(l0, vao0, y0, y1, e0, e1, material);
         bloco(vao1, l1, y0, y1, e0, e1, material);
         bloco(vao0, vao1, y0 + alturaVao, y1, e0, e1, material);
      }
   }

   // ============================================================================
   // FERRAMENTAS DE CSG (T2)
   //
   // Usamos a biblioteca CSG do próprio repositório (libs/other/CSGMesh.js), no
   // mesmo padrão do exemplo examples/geometryCSG.js:
   //    malha -> updateMatrix() -> CSG.fromMesh() -> union/subtract -> CSG.toMesh()
   // Todas as peças são montadas em coordenadas do CASTELO (antes da ESCALA): o
   // resultado é adicionado ao grupo "castelo", que aplica a escala.
   // ============================================================================

   /** Converte uma geometria posicionada/rotacionada (em Y) em um sólido CSG. */
   function solidoCSG(geometria, x, y, z, rotY = 0) {
      const m = new THREE.Mesh(geometria);
      m.position.set(x, y, z);
      m.rotation.y = rotY;
      m.updateMatrix(); // CSG.fromMesh usa mesh.matrix
      return CSG.fromMesh(m);
   }

   /**
    * Sólido em forma de ARCO (paralelepípedo + semicilindro no topo), usado como
    * "ferramenta de corte" das seteiras, portas das torres e túnel do pórtico.
    * A base do arco é reta e o topo é arredondado.
    *
    * @param {number} x,z     centro do arco no plano horizontal
    * @param {number} yBase   altura da base (parte reta de baixo)
    * @param {number} rotY    rotação em Y: com 0 a profundidade fica ao longo de Z
    * @param {number} largura largura do vão (o semicírculo tem raio largura/2)
    * @param {number} alturaReta altura da parte reta (antes do semicírculo)
    * @param {number} profundidade comprimento do corte (atravessa a parede)
    */
   function arcoCSG(x, yBase, z, rotY, largura, alturaReta, profundidade, lados = 16) {
      const caixa = solidoCSG(new THREE.BoxGeometry(largura, alturaReta, profundidade),
                              x, yBase + alturaReta / 2, z, rotY);
      // Cilindro deitado (eixo ao longo de Z local) formando o topo arredondado
      const geoCil = new THREE.CylinderGeometry(largura / 2, largura / 2, profundidade, lados)
                        .rotateX(Math.PI / 2);
      const topo = solidoCSG(geoCil, x, yBase + alturaReta, z, rotY);
      return caixa.union(topo);
   }

   /**
    * Cria uma malha a partir de um sólido CSG base menos uma lista de cortes.
    * Os cortes são unidos antes (uma única subtração é mais barata que várias).
    */
   function malhaCSG(base, cortes, material) {
      let resultado = base;
      if (cortes.length > 0) {
         let ferramenta = cortes[0];
         for (let i = 1; i < cortes.length; i++) ferramenta = ferramenta.union(cortes[i]);
         resultado = base.subtract(ferramenta);
      }
      const mesh = CSG.toMesh(resultado, new THREE.Matrix4(), material);
      castelo.add(mesh);
      return mesh;
   }

   /**
    * Paralelepípedo (definido pelos limites, como bloco()) com recortes CSG.
    * O colisor continua sendo a caixa inteira: as seteiras são estreitas demais
    * para o jogador passar, então não precisam existir na colisão.
    */
   function blocoCSG(x0, x1, y0, y1, z0, z1, material, cortes, colide = true) {
      const base = solidoCSG(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0),
                             (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
      const mesh = malhaCSG(base, cortes, material);
      if (colide) collision.addBox(mesh);
      return mesh;
   }

   /**
    * Ferramenta de corte de UMA seteira.
    *
    * @param {number} x,z   ponto da face onde a seteira é aberta (centro do corte)
    * @param {number} yBase altura da base reta da seteira
    * @param {number} nx,nz direção (unitária) que aponta para DENTRO do sólido
    * @param {number} profundidade metade do comprimento do corte
    * @param {boolean} cega  true em sólidos maciços (torres): o corte vira um nicho
    *                        de 'profundidade' e recebe um fundo escuro, dando a
    *                        impressão de abertura. Em muralhas o corte atravessa.
    */
   function seteira(x, yBase, z, nx, nz, profundidade, cega) {
      const rotY = Math.atan2(nx, nz); // alinha o Z local com a normal da face
      if (cega) {
         // Fundo escuro um pouco antes do fim do nicho (evita Z-fighting). As partes
         // da placa fora do contorno do arco ficam escondidas dentro do sólido.
         const fundo = new THREE.Mesh(
            geometriaBox(SETEIRA.largura, SETEIRA.alturaReta + SETEIRA.largura / 2, 0.04), matVao);
         fundo.position.set(x + nx * (profundidade - 0.04),
                            yBase + (SETEIRA.alturaReta + SETEIRA.largura / 2) / 2,
                            z + nz * (profundidade - 0.04));
         fundo.rotation.y = rotY;
         castelo.add(fundo);
      }
      return arcoCSG(x, yBase, z, rotY, SETEIRA.largura, SETEIRA.alturaReta, 2 * profundidade);
   }

   /**
    * Muralha reta com seteiras que a ATRAVESSAM, distribuídas ao longo do seu
    * comprimento (o eixo da espessura é detectado automaticamente).
    *
    * @param {number[]} posicoes coordenadas, ao longo do comprimento, das seteiras
    */
   function muralhaComSeteiras(x0, x1, y0, y1, z0, z1, material, posicoes, yBase = SETEIRA.yParede) {
      const espessuraEmX = (x1 - x0) < (z1 - z0);
      const cortes = [];
      for (const p of posicoes) {
         if (espessuraEmX) {
            cortes.push(seteira((x0 + x1) / 2, yBase, p, 1, 0, (x1 - x0) / 2 + 0.5, false));
         } else {
            cortes.push(seteira(p, yBase, (z0 + z1) / 2, 0, 1, (z1 - z0) / 2 + 0.5, false));
         }
      }
      return blocoCSG(x0, x1, y0, y1, z0, z1, material, cortes);
   }

   /**
    * Volume de colisão INVISÍVEL (caixa). Usado onde a malha visível tem um
    * formato que não é uma caixa (pórtico em arco, torres ocas) e nas
    * barreiras da beira d'água.
    */
   function colisor(x0, x1, y0, y1, z0, z1, opcoes = {}) {
      const mesh = new THREE.Mesh(geometriaBox(x1 - x0, y1 - y0, z1 - z0));
      mesh.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
      mesh.visible = false;
      castelo.add(mesh);
      collision.addBox(mesh, opcoes);
      return mesh;
   }

   /** Barreira invisível que impede o jogador de cair na água (dardos passam). */
   function barreira(x0, x1, z0, z1, yBase) {
      return colisor(x0, x1, yBase, yBase + 4, z0, z1, { onlyActor: true });
   }

   // ============================================================================
   // 1) MURALHAS EXTERNAS
   // ============================================================================
   function construirMuralhas() {
      const H = MURALHA.altura;

      // As muralhas são criadas com seteiras recortadas via CSG (muralhaComSeteiras).
      // As posições evitam as torres e a portaria, que cobrem a face externa.

      // --- Muralha NORTE: interrompida pelo vão do portão principal --------------
      // (o trecho sobre o vão agora faz parte do bloco central do pórtico, ver
      //  construirPortaria(), que também é recortado via CSG)
      muralhaComSeteiras(-42, -PORTAO.meiaLargura, 0, H, -FACE_EXT, -FACE_INT, matPedra, [-26, -19]); // trecho oeste
      muralhaComSeteiras(PORTAO.meiaLargura, 42, 0, H, -FACE_EXT, -FACE_INT, matPedra, [19, 26]);     // trecho leste

      // --- Demais muralhas -------------------------------------------------------
      muralhaComSeteiras(-42, 42, 0, H,  FACE_INT,  FACE_EXT, matPedra, [-26, -19, -12, 12, 19, 26]); // sul
      muralhaComSeteiras(-FACE_EXT, -FACE_INT, 0, H, -42, 42, matPedra, [-26, -19, -12, 12, 19, 26]); // oeste

      // Muralha LESTE: dividida em dois trechos independentes.
      //  - Trecho de trás (torre intermediária -> torre de canto traseira,
      //    z positivo): reta, igual às demais muralhas.
      const zTorreInt = 6.5; // meia largura da torre intermediária (ver construirTorresIntermediarias)
      muralhaComSeteiras(FACE_INT, FACE_EXT, 0, H, zTorreInt - (zTorreInt/2), 42, matPedra, [12, 19, 26]); // leste - trecho reto (traseiro)

      // trecho torto
      muralhaComSeteiras(FACE_INT-5, FACE_EXT-5, 0, H, -42, zTorreInt -30, matPedra, [-31]);
      muralhaComSeteiras(FACE_INT, FACE_EXT, 0, H, zTorreInt -30, zTorreInt + (zTorreInt/2), matPedra, [-16, -9.5]);
      bloco(FACE_INT -5, FACE_EXT, 0, H, zTorreInt -35, zTorreInt-30, matPedra);

      // --- Ameias (merlões) na borda EXTERNA do caminho de ronda -----------------
      const yA0 = H, yA1 = H + MERLAO.altura;
      const e = MERLAO.espessura;

      // As fileiras são interrompidas onde há torres, pois o volume da torre já
      // fecha a borda. Nas torres de canto a fileira termina exatamente na face
      // da torre ('B'): como as torres agora são ocas (acessíveis), merlões
      // que entrassem no volume da torre apareceriam dentro da câmara.
      const T = 4.5;  // meia largura das torres quadradas intermediárias
      const B = MURALHA.meio - TORRE_CANTO.raio; // 31.5

      // Norte: interrompida por todo o bloco da portaria (x de -12 a 12)
      fileiraDeMerloes('x', -FACE_EXT, -FACE_EXT + e, -B, -12, yA0, yA1, matAmeia);
      fileiraDeMerloes('x', -FACE_EXT, -FACE_EXT + e,  12,  B, yA0, yA1, matAmeia);

      // Sul: interrompida apenas pela torre da poterna
      fileiraDeMerloes('x', FACE_EXT - e, FACE_EXT, -B, -T, yA0, yA1, matAmeia);
      fileiraDeMerloes('x', FACE_EXT - e, FACE_EXT,   T, B, yA0, yA1, matAmeia);

      // Oeste: interrompida pela torre intermediária
      fileiraDeMerloes('z', -FACE_EXT, -FACE_EXT + e, -B, -T, yA0, yA1, matAmeia);
      fileiraDeMerloes('z', -FACE_EXT, -FACE_EXT + e,   T, B, yA0, yA1, matAmeia);
      // Leste: trecho reto (traseiro)
      fileiraDeMerloes('z',  FACE_EXT - e, FACE_EXT,    T, B, yA0, yA1, matAmeia);

      // Leste: trecho torto (frente) - ameias acompanhando o contorno externo
      // do zigue-zague (recuo -> degrau de ligação -> volta à posição normal,
      // ver os 3 blocos do "trecho torto" acima). Mesmo padrão de
      // coroarTorreQuadrada(): a fileira que atravessa a quina (eixo x) fica
      // inteira, e as que chegam nela (eixo z) são encurtadas em 'e' para não
      // se sobrepor.
      const zDegrau = zTorreInt - 35; // z do degrau que liga os dois trechos retos
      // O trecho recuado começa na face da torre de canto nordeste (que agora é
      // oca): z onde a linha das ameias (x = FACE_EXT-5-e/2) cruza o cilindro.
      const dxTorreNE = (FACE_EXT - 5 - e / 2) - MURALHA.meio;
      const zIniRecuado = -MURALHA.meio + Math.sqrt(TORRE_CANTO.raio ** 2 - dxTorreNE ** 2);
      fileiraDeMerloes('z', FACE_EXT - 5 - e, FACE_EXT - 5, zIniRecuado, zDegrau - e, yA0, yA1, matAmeia); // trecho recuado
      fileiraDeMerloes('x', zDegrau, zDegrau + e, FACE_EXT - 5, FACE_EXT, yA0, yA1, matAmeia);       // degrau de ligação
      fileiraDeMerloes('z', FACE_EXT - e, FACE_EXT, zDegrau + e, T, yA0, yA1, matAmeia);              // volta à posição normal

      // --- Escada externa até o caminho de ronda ----------------------------------
      // Sobe do chão (baseY=0) direto até o topo da muralha sul (H), no trecho
      // livre entre a torre de canto sudoeste e o poço. Mesmo padrão das escadas
      // dos alojamentos/torre de menagem: corre PARALELA à parede (mesmo eixo da
      // muralha) e fica ENCOSTADA nela (lat1 = FACE_INT, flush com a face interna),
      // com mureta só do lado aberto (lat0, virado para o pátio) - do lado da
      // muralha (lat1) ela já serve de "parede", como acontece com os prédios.
      const degrausMuralha = contarDegraus(H);
      const inicioEscadaMuralha  = -30, chegadaEscadaMuralha = -4;

      const paramEscadaMuralha = {
         eixo: 'x', inicio: inicioEscadaMuralha, sentido: +1,
         lat0: FACE_INT - 3.5, lat1: FACE_INT,
         baseY: 0, degraus: degrausMuralha, espelho: H / degrausMuralha,
         piso: (chegadaEscadaMuralha - inicioEscadaMuralha) / degrausMuralha,
         mureta: 1.0, muretas: [true, false]
      };
      escada(paramEscadaMuralha);
      rampaInvisivel(paramEscadaMuralha);
   }

   // ============================================================================
   // 2) TORRES CILÍNDRICAS DE CANTO (acessíveis - T2)
   //
   //    Cada torre é um cilindro maciço do qual a CSG subtrai:
   //      - a CÂMARA, no nível do caminho de ronda;
   //      - o TERRAÇO, no topo (sobra o anel do parapeito);
   //      - o ALÇAPÃO na laje entre os dois, por onde passa a escada;
   //      - duas PORTAS em arco, uma para cada muralha que chega na torre;
   //      - as SETEIRAS do corpo da torre (nichos com fundo escuro).
   //    Assim, saindo do caminho de ronda, o jogador entra pela porta, sobe a
   //    escada interna e chega ao terraço. As torres também ligam os caminhos de
   //    ronda das duas muralhas que se encontram nelas.
   // ============================================================================
   function construirTorresDeCanto() {
      // canto = MURALHA.meio: a torre fica centrada exatamente no cruzamento
      // das linhas médias das muralhas (não na face interna nem na externa),
      // de modo que metade do cilindro fique para dentro e metade para fora
      // da espessura da muralha - efeito visual de torre "encaixada" na quina.
      const canto = MURALHA.meio;

      // Centro (largura útil) do caminho de ronda de cada muralha: da face
      // interna até a fileira de ameias da face externa.
      const meioRonda      = (FACE_INT + FACE_EXT - MERLAO.espessura) / 2;         // 39.6
      const meioRondaTorto = (FACE_INT - 5 + FACE_EXT - 5 - MERLAO.espessura) / 2; // trecho torto (leste, frente)

      for (const sx of [-1, 1]) {
         for (const sz of [-1, 1]) {
            // A muralha leste da frente (nordeste: sx=+1, sz=-1) é o trecho torto
            const rondaX = (sx > 0 && sz < 0) ? meioRondaTorto : sx * meioRonda;
            construirTorreAcessivel(sx * canto, sz * canto, sx, sz,
                                    sz * meioRonda - sz * canto, // porta da muralha norte/sul (desloc. em z)
                                    rondaX - sx * canto);        // porta da muralha oeste/leste (desloc. em x)
         }
      }
   }

   /**
    * Constrói UMA torre cilíndrica acessível.
    *
    * @param {number} cx,cz centro da torre
    * @param {number} sx,sz sinais do canto (-1/+1): a torre se liga às muralhas
    *                       que seguem para -sx (em X) e para -sz (em Z)
    * @param {number} latPortaX deslocamento em Z (relativo ao centro) da porta
    *                       que dá para a muralha que corre ao longo de X
    * @param {number} latPortaZ deslocamento em X da porta que dá para a muralha
    *                       que corre ao longo de Z
    */
   function construirTorreAcessivel(cx, cz, sx, sz, latPortaX, latPortaZ) {
      const R     = TORRE_CANTO.raio;
      const Htor  = TORRE_CANTO.altura;
      const yPiso = MURALHA.altura + 0.02; // um pouco acima do topo das muralhas
                                           // que atravessam a torre (evita Z-fighting)
      const A     = TORRE_ACESSO;
      const P     = A.porta;
      const cortes = [];

      // --- Corpo maciço ---------------------------------------------------------
      const corpo = solidoCSG(geometriaCilindro(R, Htor, 28), cx, Htor / 2, cz);

      // --- Câmara e terraço -------------------------------------------------------
      cortes.push(solidoCSG(geometriaCilindro(A.rCamara, A.yTeto - yPiso, 28),
                            cx, (yPiso + A.yTeto) / 2, cz));
      cortes.push(solidoCSG(geometriaCilindro(A.rTerraco, 4, 28),
                            cx, A.yTerraco + 2, cz));

      // --- Escada interna: ocupa o lado +sz da câmara e sobe no sentido +sx -----
      const meioComp = 3.5;                 // meio comprimento da escada (em X)
      const latEsc0 = 2.0, latEsc1 = 4.2;   // faixa da escada (em Z, a partir do centro)
      const subida  = A.yTerraco - yPiso;
      const degraus = contarDegraus(subida);
      const paramEscada = {
         eixo: 'x', inicio: cx - sx * meioComp, sentido: sx,
         lat0: cz + Math.min(sz * latEsc0, sz * latEsc1),
         lat1: cz + Math.max(sz * latEsc0, sz * latEsc1),
         baseY: yPiso, degraus: degraus, espelho: subida / degraus,
         piso: (2 * meioComp) / degraus, mureta: 0
      };
      escada(paramEscada);
      rampaInvisivel(paramEscada);

      // --- Alçapão na laje -------------------------------------------------------
      // Começa onde a cabeça do jogador já passaria da laje e vai até depois do
      // último degrau. Valores relativos ao centro (multiplicados pelos sinais).
      const alc = { x0: -1.3, x1: 3.8, z0: 1.7, z1: 4.5 };
      const ax0 = cx + Math.min(sx * alc.x0, sx * alc.x1), ax1 = cx + Math.max(sx * alc.x0, sx * alc.x1);
      const az0 = cz + Math.min(sz * alc.z0, sz * alc.z1), az1 = cz + Math.max(sz * alc.z0, sz * alc.z1);
      cortes.push(solidoCSG(new THREE.BoxGeometry(ax1 - ax0, A.yTerraco - A.yTeto + 0.4, az1 - az0),
                            (ax0 + ax1) / 2, (A.yTeto + A.yTerraco) / 2, (az0 + az1) / 2));

      // --- Portas em arco (uma para cada muralha) ---------------------------------
      // O corte atravessa toda a parede (do raio da câmara até o raio externo),
      // considerando a largura da porta e o deslocamento lateral em relação ao
      // centro da torre.
      const portas = [
         { eixo: 'x', lado: -sx, lat: latPortaX },
         { eixo: 'z', lado: -sz, lat: latPortaZ }
      ];
      for (const pt of portas) {
         const latLonge = Math.abs(pt.lat) + P.largura / 2;
         const latPerto = Math.max(0, Math.abs(pt.lat) - P.largura / 2);
         const dentro = Math.sqrt(Math.max(0, A.rCamara ** 2 - latLonge ** 2));
         const fora   = Math.sqrt(R ** 2 - latPerto ** 2);
         const meio   = pt.lado * (dentro + fora) / 2;
         const prof   = (fora - dentro) + 1.0;
         if (pt.eixo === 'x') {
            cortes.push(arcoCSG(cx + meio, yPiso, cz + pt.lat, Math.PI / 2, P.largura, P.alturaReta, prof));
         } else {
            cortes.push(arcoCSG(cx + pt.lat, yPiso, cz + meio, 0, P.largura, P.alturaReta, prof));
         }
      }

      // --- Seteiras em espiral no corpo da torre ----------------------------------
      // A cada passo o ângulo avança 0.9 rad (~51,6°), espalhando as seteiras por
      // toda a circunferência. As que cairiam dentro das muralhas são puladas.
      const yIni = 5, yFim = MURALHA.altura - 4;
      const nSet = 12;
      for (let k = 0; k < nSet; k++) {
         const ang = -Math.PI / 4 + k * 0.9;
         const px = Math.cos(ang) * R, pz = Math.sin(ang) * R; // relativo ao centro
         const naMuralhaX = Math.abs(pz) < FACE_EXT - MURALHA.meio + 0.5 && px * sx < 0;
         const naMuralhaZ = Math.abs(px) < FACE_EXT - MURALHA.meio + 0.5 && pz * sz < 0;
         if (naMuralhaX || naMuralhaZ) continue;
         cortes.push(seteira(cx + px, yIni + (k / (nSet - 1)) * (yFim - yIni), cz + pz,
                             -Math.cos(ang), -Math.sin(ang), 1.2, true));
      }

      malhaCSG(corpo, cortes, matPedraEsc);

      // Cornija saliente no topo (decorativa)
      cilindro(R + 0.7, 0.8, cx, Htor - 0.6, cz, matPedra, false);

      // Coroa de merlões sobre o parapeito: 'n' blocos distribuídos em círculo,
      // cada um rotacionado para apontar radialmente para fora (decorativos: a
      // colisão do parapeito é feita pelos colisores em anel, abaixo).
      const n = 14;
      for (let i = 0; i < n; i++) {
         const ang = (i / n) * Math.PI * 2;
         const m   = new THREE.Mesh(geometriaBox(1.5, MERLAO.altura, 0.9), matAmeia);
         m.position.set(cx + Math.cos(ang) * (R - 0.2),
                        Htor + 0.2 + MERLAO.altura / 2,
                        cz + Math.sin(ang) * (R - 0.2));
         m.rotation.y = -ang; // faces voltadas para fora
         castelo.add(m);
      }

      // =====================================================================
      // COLISÃO DA TORRE OCA
      // O sistema de colisão só conhece caixas e cilindros maciços, então a
      // torre é descrita por partes:
      //   - cilindro maciço do chão até o piso da câmara;
      //   - anel de caixas na parede da câmara (com as portas livres);
      //   - laje do terraço: 4 caixas em volta do alçapão;
      //   - anel de caixas no parapeito do terraço (até o topo dos merlões,
      //     para o pulo não levar o jogador para fora da torre).
      // =====================================================================
      const base = cilindro(R, yPiso, cx, 0, cz, matPedraEsc, true);
      base.visible = false;

      // Uma caixa do anel fica livre se estiver no corredor de alguma porta
      const naPorta = (bx, bz, folga) => portas.some(pt => (pt.eixo === 'x')
         ? (bx * pt.lado > 0 && Math.abs(bz - pt.lat) < P.largura / 2 + folga)
         : (bz * pt.lado > 0 && Math.abs(bx - pt.lat) < P.largura / 2 + folga));

      const anel = (raio, tam, qtd, y0, y1, comPortas) => {
         for (let i = 0; i < qtd; i++) {
            const ang = (i / qtd) * Math.PI * 2;
            const bx = Math.cos(ang) * raio, bz = Math.sin(ang) * raio;
            if (comPortas && naPorta(bx, bz, tam / 2)) continue;
            colisor(cx + bx - tam / 2, cx + bx + tam / 2, y0, y1,
                    cz + bz - tam / 2, cz + bz + tam / 2);
         }
      };
      anel((A.rCamara + R) / 2, R - A.rCamara, 26, yPiso, A.yTeto, true);
      anel((A.rTerraco + R) / 2, R - A.rTerraco, 52, A.yTerraco,
           Htor + 0.2 + MERLAO.altura, false);

      // Laje do terraço = quadrado inscrito na câmara menos o alçapão
      const q = A.rCamara;
      colisor(cx - q, ax0,    A.yTeto, A.yTerraco, cz - q, cz + q);
      colisor(ax1,    cx + q, A.yTeto, A.yTerraco, cz - q, cz + q);
      colisor(ax0,    ax1,    A.yTeto, A.yTerraco, cz - q, az0);
      colisor(ax0,    ax1,    A.yTeto, A.yTerraco, az1,    cz + q);

      // Guarda-corpo em volta do alçapão (nos dois lados compridos e no fundo),
      // para o jogador não cair de volta na escada andando pelo terraço. Fica
      // aberto apenas o lado onde a escada chega.
      const gc = 0.25, hGc = A.yTerraco + 0.9;
      const zIn0 = cz + Math.min(sz * (alc.z0 - gc), sz * alc.z0), zIn1 = cz + Math.max(sz * (alc.z0 - gc), sz * alc.z0);
      const zEx0 = cz + Math.min(sz * alc.z1, sz * (alc.z1 + gc)), zEx1 = cz + Math.max(sz * alc.z1, sz * (alc.z1 + gc));
      const xF0  = cx + Math.min(sx * (alc.x0 - gc), sx * alc.x0), xF1 = cx + Math.max(sx * (alc.x0 - gc), sx * alc.x0);
      bloco(ax0, ax1, A.yTerraco, hGc, zIn0, zIn1, matDegrau);
      bloco(ax0, ax1, A.yTerraco, hGc, zEx0, zEx1, matDegrau);
      bloco(xF0, xF1, A.yTerraco, hGc, Math.min(zIn0, zEx0), Math.max(zIn1, zEx1), matDegrau);
   }

   /**
    * Coroa de merlões sobre uma torre quadrada (nos 4 lados do topo).
    */
   function coroarTorreQuadrada(x0, x1, z0, z1, topo) {
      const e = 0.8, y1 = topo + MERLAO.altura;
      fileiraDeMerloes('x', z0, z0 + e, x0, x1, topo, y1, matAmeia);
      fileiraDeMerloes('x', z1 - e, z1, x0, x1, topo, y1, matAmeia);
      fileiraDeMerloes('z', x0, x0 + e, z0 + e, z1 - e, topo, y1, matAmeia);
      fileiraDeMerloes('z', x1 - e, x1, z0 + e, z1 - e, topo, y1, matAmeia);
   }

   // ============================================================================
   // 3) TORRES QUADRADAS INTERMEDIÁRIAS (leste, oeste e sul)
   //    Avançam para FORA da muralha, deixando o caminho de ronda livre por dentro.
   // ============================================================================
   function construirTorresIntermediarias() {
      const H = 30, saliencia = 12, meiaLargura = 6.5;

      const xF = FACE_EXT + saliencia; // face externa das torres leste/oeste (e sul, em z)
      const yS = [8, 18];              // alturas das duas seteiras de cada torre

      // Leste: corpo da torre (com 2 seteiras CSG na face externa) + coroa de merlões
      blocoCSG(FACE_EXT - 1, xF, 0, H, -meiaLargura, meiaLargura, matPedraEsc,
               yS.map(y => seteira(xF, y, 0, -1, 0, 1.2, true)));
      coroarTorreQuadrada(FACE_EXT - 1, xF, -meiaLargura, meiaLargura, H);

      // Oeste: mesma estrutura da torre leste, espelhada em X
      blocoCSG(-xF, -FACE_EXT + 1, 0, H, -meiaLargura, meiaLargura, matPedraEsc,
               yS.map(y => seteira(-xF, y, 0, 1, 0, 1.2, true)));
      coroarTorreQuadrada(-xF, -FACE_EXT + 1, -meiaLargura, meiaLargura, H);

      // Sul (torre da poterna): mesma estrutura, girada 90° (avança em Z)
      blocoCSG(-meiaLargura, meiaLargura, 0, H, FACE_EXT - 1, xF, matPedraEsc,
               yS.map(y => seteira(0, y, xF, 0, -1, 1.2, true)));
      coroarTorreQuadrada(-meiaLargura, meiaLargura, FACE_EXT - 1, xF, H);
   }

   // ============================================================================
   // 4) PORTARIA (norte) + PORTA PRINCIPAL ANIMADA (grade que sobe)
   // ============================================================================
   function construirPortaria() {
      // A portaria é formada por TRÊS retângulos, como no castelo real:
      // as duas torres laterais e um bloco central do MESMO TAMANHO delas,
      // porém recuado (mais para dentro), passando através da muralha.
      const Htorres  = 35;   // altura das três partes da portaria
      const recuo    = 4;    // quanto o bloco central fica recuado (para dentro)
      const zFrente = -49, zFundo = -41;
      const L = PORTAO.meiaLargura;   // 4

      // Duas torres retangulares ladeando a passagem, cada uma com duas
      // seteiras (CSG) na fachada frontal
      const ySetPortaria = [9, 20];
      blocoCSG(L, L + 8, 0, Htorres, zFrente, zFundo, matPedraEsc,              // torre leste
               ySetPortaria.map(y => seteira(L + 4, y, zFrente, 0, 1, 1.2, true)));
      blocoCSG(-L - 8, -L, 0, Htorres, zFrente, zFundo, matPedraEsc,            // torre oeste
               ySetPortaria.map(y => seteira(-L - 4, y, zFrente, 0, 1, 1.2, true)));
      coroarTorreQuadrada(L, L + 8, zFrente, zFundo, Htorres);
      coroarTorreQuadrada(-L - 8, -L, zFrente, zFundo, Htorres);

      // ---------------------------------------------------------------------
      // PÓRTICO (CSG)
      // Bloco central: mesmo tamanho das torres, só que recuado em Z (passa
      // através da muralha, saindo um pouco do outro lado). Agora ele desce até
      // o chão e o TÚNEL de entrada é recortado nele com um arco (base reta e
      // topo arredondado), como no castelo de referência. Usa matPedra (cor da
      // muralha), reforçando visualmente que é parte da própria parede.
      // ---------------------------------------------------------------------
      const zC0 = zFrente + recuo, zC1 = zFundo + recuo; // -45 .. -37
      const ARCO = { largura: 6, alturaReta: 6 };         // topo do arco em y = 9
      const tunel = arcoCSG(0, -0.5, (zC0 + zC1) / 2, 0, ARCO.largura,
                            ARCO.alturaReta + 0.5, (zC1 - zC0) + 2, 32);
      const janela = seteira(0, 26, zC0, 0, 1, 1.2, true); // janela alta sobre a entrada
      blocoCSG(-L, L, 0, Htorres, zC0, zC1, matPedra, [tunel, janela], false);
      coroarTorreQuadrada(-L, L, zC0, zC1, Htorres);

      // Colisão do pórtico: dois pilares + a parte acima do arco
      const meioArco = ARCO.largura / 2;
      colisor(-L, -meioArco, 0, Htorres, zC0, zC1);
      colisor(meioArco, L, 0, Htorres, zC0, zC1);
      colisor(-meioArco, meioArco, ARCO.alturaReta + meioArco, Htorres, zC0, zC1);

      // Arquivolta: moldura saliente em volta do arco (arco maior - arco menor)
      const arcoExt = arcoCSG(0, 0, zC0 - 0.25, 0, ARCO.largura + 1.2, ARCO.alturaReta, 0.6, 32);
      const arcoInt = arcoCSG(0, -0.5, zC0 - 0.25, 0, ARCO.largura, ARCO.alturaReta + 0.5, 2, 32);
      malhaCSG(arcoExt.subtract(arcoInt), [], matPedraEsc);

      // Paredes de fechamento do túnel de entrada, do lado interno (pátio):
      // duas laterais + verga por cima, no mesmo padrão da muralha norte
      // (a passagem termina aqui, com o piso do caminho de ronda por cima).
      bloco(4, 7, 0, PORTAO.altura + 0.6, zFundo, zFundo + 8, matPedra);   // lateral leste
      bloco(-7, -4, 0, PORTAO.altura + 0.6, zFundo, zFundo + 8, matPedra); // lateral oeste
      bloco(-7, 7, PORTAO.altura, PORTAO.altura + 0.6, zFundo, zFundo + 8, matPedra); // verga

      // ---------------------------------------------------------------------
      // PORTA 1: grade (portcullis) que DESLIZA PARA CIMA
      // ---------------------------------------------------------------------
      const grade = new THREE.Group();
      grade.position.set(0, 0, zFrente + 3); // dentro do túnel de entrada
      castelo.add(grade);

      const barra = 0.22;
      // Barras verticais (9 barras simétricas, de -3.6 a 3.6)
      const geoBarraV = geometriaBox(barra, PORTAO.altura, barra);
      for (let x = -3.6; x <= 3.6 + 1e-6; x += 0.9) {
         const g = new THREE.Mesh(geoBarraV, matFerro);
         g.position.set(x, PORTAO.altura / 2, 0);
         grade.add(g);
      }
      // Barras horizontais
      const geoBarraH = geometriaBox(2 * L - 0.4, barra, barra * 0.8);
      for (let y = 0.6; y <= PORTAO.altura - 0.3; y += 1.5) {
         const g = new THREE.Mesh(geoBarraH, matFerro);
         g.position.set(0, y, 0);
         grade.add(g);
      }
      // (a moldura de pedra do T1 foi substituída pela arquivolta CSG, acima)
      

      const portaPrincipal = new AnimatedDoor({
         nome: "Portão principal",
         // A grade sobe (translação em Y) até sumir dentro da portaria
         trilhas: [{ obj: grade, propriedade: 'posY', de: 0, para: PORTAO.altura + 0.4 }],
         // ponto/distância são posições em MUNDO: como a grade é filha do grupo
         // "castelo" (escalado por ESCALA), o gatilho precisa da mesma escala.
         ponto: new THREE.Vector3(0, 2, zFrente + 3).multiplyScalar(ESCALA),
         distancia: 14 * ESCALA,
         velocidade: 0.7,
         // A grade só deixa de bloquear quando já subiu quase todo o curso
         limiarColisao: 0.85
      });
      // Enquanto fechada, a grade bloqueia a passagem (colisor dinâmico)
      collision.addBox(grade, { dynamic: true, isActive: () => !portaPrincipal.aberta });
      doors.push(portaPrincipal);
   }

   // ============================================================================
   // 5) CONSTRUÇÃO INTERNA A - ALOJAMENTOS (oeste do pátio)
   //    Salão vazado + terraço superior + escada externa + porta animada.
   // ============================================================================
   function construirAlojamentos() {
      const x0 = -34, x1 = -16, z0 = -12, z1 = 12;
      const H  = 9, esp = 1;             // altura e espessura das paredes
      const lajeTopo = H + 0.6;          // piso do terraço

      // A escada é calculada ANTES do parapeito: assim a abertura por onde
      // ela chega no terraço nasce sempre no lugar certo, mesmo que o
      // degrau-alvo (DEGRAU.espelhoAlvo) mude depois.
      //   - 'degraus'/'espelho' seguem o degrau-alvo do castelo (subida segura);
      //   - 'piso' (profundidade) é calculado para a escada terminar em
      //     'chegada', a 'buffer' unidades da parede leste (onde fica a porta),
      //     deixando essa margem de parapeito sólido entre a abertura e o canto.
      const degrausAlojamentos = contarDegraus(lajeTopo);
      const buffer      = 2;
      const chegadaAlojamentos = x1 - buffer;
      const pisoAlojamentos    = (chegadaAlojamentos - x0) / degrausAlojamentos;

      // Paredes (a face leste tem o vão da porta)
      bloco(x0, x0 + esp, 0, H, z0, z1, matPredio);          // oeste
      bloco(x0, x1, 0, H, z0, z0 + esp, matPredio);          // norte
      bloco(x0, x1, 0, H, z1 - esp, z1, matPredio);          // sul
      paredeComVao('x', x1 - esp, x1, 0, H, z0, z1, -2, 2, 6, matPredio); // leste + vão

      // Laje do terraço
      bloco(x0, x1, H, lajeTopo, z0, z1, matPredio);

      // Parapeito do terraço. A fileira norte só cobre até a abertura onde a
      // escada externa chega (calculada acima) - dali até o canto (x1) fica
      // livre para o jogador entrar no terraço.
      const p = 0.6, ph = 1.0;
      const aberturaAlojamentos = chegadaAlojamentos - 4;
      fileiraDeMerloes('x', z0, z0 + p, x0, aberturaAlojamentos, lajeTopo, lajeTopo + ph, matAmeia);
      fileiraDeMerloes('x', z1 - p, z1, x0, x1, lajeTopo, lajeTopo + ph, matAmeia);
      fileiraDeMerloes('z', x0, x0 + p, z0 + p, z1 - p, lajeTopo, lajeTopo + ph, matAmeia);
      fileiraDeMerloes('z', x1 - p, x1, z0 + p, z1 - p, lajeTopo, lajeTopo + ph, matAmeia);

      // Janelas na fachada leste (decorativas)
      for (const z of [-8, -5, 5, 8]) {
         bloco(x1 - 0.1, x1 + 0.12, 3.5, 6.0, z - 0.6, z + 0.6, matVao, false);
      }

      // Escada externa ao norte: sobe no sentido +X até o nível do terraço,
      // terminando exatamente na abertura do parapeito calculada acima.

      const paramEscadaAlojamento = {
         eixo: 'x', inicio: x0, sentido: +1, lat0: -15.5, lat1: -12,
         baseY: 0, degraus: degrausAlojamentos, espelho: lajeTopo / degrausAlojamentos,
         piso: pisoAlojamentos, mureta: 1.0, muretas: [true, false]
      };
      escada(paramEscadaAlojamento);
      rampaInvisivel(paramEscadaAlojamento);

      // Mobiliário simples no interior (caixotes)
      bloco(-32, -30, 0, 1.2, -9, -7, matMadeira);
      bloco(-32, -30.4, 1.2, 2.4, -8.6, -7.4, matMadeira);
      bloco(-31, -29, 0, 1.2, 6, 8, matMadeira);

      // ---------------------------------------------------------------------
      // PORTA 2: duas folhas de madeira que GIRAM para dentro
      // As dobradiças ficam recuadas meia espessura em relação à borda do vão,
      // de modo que a folha aberta encoste na ombreira sem penetrá-la.
      // ---------------------------------------------------------------------
      const xPorta = x1 - esp / 2;
      const eF     = 0.25;              // espessura da folha
      const folhaA = criarFolhaDePorta(xPorta, -2 + eF / 2, 2 - eF / 2, 6, eF, matMadeira, +1);
      const folhaB = criarFolhaDePorta(xPorta,  2 - eF / 2, 2 - eF / 2, 6, eF, matMadeira, -1);

      const portaAlojamentos = new AnimatedDoor({
         nome: "Porta dos alojamentos",
         trilhas: [
            { obj: folhaA.pivo, propriedade: 'rotY', de: 0, para: -Math.PI / 2 },
            { obj: folhaB.pivo, propriedade: 'rotY', de: 0, para:  Math.PI / 2 }
         ],
         ponto: new THREE.Vector3(xPorta, 1, 0).multiplyScalar(ESCALA),
         distancia: 7 * ESCALA,
         velocidade: 1.4
      });
      collision.addBox(folhaA.mesh, { dynamic: true, isActive: () => !portaAlojamentos.aberta });
      collision.addBox(folhaB.mesh, { dynamic: true, isActive: () => !portaAlojamentos.aberta });
      doors.push(portaAlojamentos);
   }

   // ============================================================================
   // 6) CONSTRUÇÃO INTERNA B - TORRE DE MENAGEM (leste do pátio)
   // ============================================================================
   function construirTorreDeMenagem() {
      const x0 = 14, x1 = 34, z0 = -10, z1 = 10;
      const H = 12, esp = 1.2;
      const lajeTopo = H + 0.6;

      // A escada é calculada ANTES do parapeito (mesma ideia da função
      // construirAlojamentos()): 'piso' é ajustado para ela terminar em
      // 'chegada', a 'buffer' unidades da parede oeste (onde fica a porta).
      const degrausMenagem = contarDegraus(lajeTopo);
      const buffer         = 2;
      const chegadaMenagem = x0 + buffer;
      const pisoMenagem     = (x1 - chegadaMenagem) / degrausMenagem;

      bloco(x1 - esp, x1, 0, H, z0, z1, matPredio);   // leste
      bloco(x0, x1, 0, H, z0, z0 + esp, matPredio);   // norte
      bloco(x0, x1, 0, H, z1 - esp, z1, matPredio);   // sul
      paredeComVao('x', x0, x0 + esp, 0, H, z0, z1, -2, 2, 6, matPredio); // oeste + vão

      // Laje do terraço e ameias em volta. A fileira sul só cobre a partir da
      // abertura onde a escada externa chega (calculada acima) até o canto leste.
      bloco(x0, x1, H, lajeTopo, z0, z1, matPredio);
      const e = 0.7, ay = lajeTopo + MERLAO.altura;
      const aberturaMenagem = chegadaMenagem + 4;
      fileiraDeMerloes('x', z0, z0 + e, x0, x1, lajeTopo, ay, matAmeia);
      fileiraDeMerloes('x', z1 - e, z1, aberturaMenagem, x1, lajeTopo, ay, matAmeia);
      fileiraDeMerloes('z', x0, x0 + e, z0 + e, z1 - e, lajeTopo, ay, matAmeia);
      fileiraDeMerloes('z', x1 - e, x1, z0 + e, z1 - e, lajeTopo, ay, matAmeia);

      // Janelas decorativas
      for (const z of [-3, 0, 3]) {
         bloco(x0 - 0.12, x0 + 0.1, 7.5, 10.0, z - 0.6, z + 0.6, matVao, false);
      }

      // Escada externa ao sul: sobe no sentido -X até o terraço, terminando
      // exatamente na abertura do parapeito calculada acima.
      // (mureta apenas no lado externo, lat1)

      const paramEscadaMenagem = {
         eixo: 'x', inicio: x1, sentido: -1, lat0: 10, lat1: 13,
         baseY: 0, degraus: degrausMenagem, espelho: lajeTopo / degrausMenagem,
         piso: pisoMenagem, mureta: 1.0, muretas: [false, true]
      };
      escada(paramEscadaMenagem);
      rampaInvisivel(paramEscadaMenagem);

      // ---------------------------------------------------------------------
      // PORTA 3: folha única de madeira que GIRA para dentro
      // ---------------------------------------------------------------------
      const xPorta = x0 + esp / 2;
      const eF     = 0.3;               // espessura da folha
      const folha  = criarFolhaDePorta(xPorta, -2 + eF / 2, 4 - eF / 2, 6, eF, matMadeira, +1);

      const portaMenagem = new AnimatedDoor({
         nome: "Porta da torre de menagem",
         trilhas: [{ obj: folha.pivo, propriedade: 'rotY', de: 0, para: Math.PI / 2 }],
         // ponto/distância são posições em MUNDO: como a folha é filha do grupo
         // "castelo" (escalado por ESCALA), o gatilho precisa da mesma escala -
         // senão ele fica deslocado da porta real (abre cedo demais e, pior,
         // não é mais alcançável de dentro para reabrir na saída).
         ponto: new THREE.Vector3(xPorta, 1.5, 0).multiplyScalar(ESCALA),
         distancia: 7 * ESCALA,
         velocidade: 1.2
      });
      collision.addBox(folha.mesh, { dynamic: true, isActive: () => !portaMenagem.aberta });
      doors.push(portaMenagem);
   }

   /**
    * Cria uma folha de porta com dobradiça.
    * O pivô (THREE.Group) fica na dobradiça e a folha é deslocada meia largura,
    * de modo que girar o pivô em Y gira a porta em torno da dobradiça.
    *
    * @param {number} x      posição da porta no eixo X (parede perpendicular a X)
    * @param {number} zHinge posição da dobradiça em Z
    * @param {number} larg   largura da folha
    * @param {number} alt    altura da folha
    * @param {number} esp    espessura da folha
    * @param {number} sentido +1 se a folha se estende para +Z, -1 para -Z
    */
   function criarFolhaDePorta(x, zHinge, larg, alt, esp, material, sentido) {
      const pivo = new THREE.Group();
      pivo.position.set(x, 0, zHinge);
      castelo.add(pivo);

      const mesh = new THREE.Mesh(geometriaBox(esp, alt, larg), material);
      mesh.position.set(0, alt / 2, sentido * larg / 2);
      pivo.add(mesh);

      // Travessas de reforço (detalhe da porta de madeira)
      const geoTravessa = geometriaBox(esp * 1.6, 0.25, larg * 0.9);
      for (const h of [alt * 0.25, alt * 0.75]) {
         const t = new THREE.Mesh(geoTravessa, matFerro);
         t.position.set(0, h, sentido * larg / 2);
         pivo.add(t);
      }
      return { pivo, mesh };
   }

   // ============================================================================
   // 7) DETALHES DO PÁTIO (poço, barris, calçada)
   // ============================================================================
   function construirPatio() {
      // Calçada ligando o portão às duas construções. Ela é interrompida na
      // praça circular da escotilha do portal (ver interior.js).
      const raioPraca = 8;
      bloco(-3, 3, 0, 0.15, -38, ESCOTILHA.z - raioPraca + 0.5, matPedraEsc, false);
      bloco(-3, 3, 0, 0.15, ESCOTILHA.z + raioPraca - 0.5, 38, matPedraEsc, false);
      bloco(-16, 14, 0, 0.15, -3, 3, matPedraEsc, false);

      // Poço no centro-sul do pátio
      construirPoco();

      // Barris encostados na muralha oeste, no trecho SUL do beco.
      // O trecho norte do beco (z de -15.5 a -12) precisa ficar livre: é por ele
      // que se chega ao pé da escada externa dos alojamentos.
      for (let i = 0; i < 4; i++) {
         cilindro(0.7, 1.5, -35.5, 0, 2 + i * 2.2, matMadeira, true, 14);
      }
      // Caixotes perto da torre de menagem
      bloco(8, 10, 0, 1.6, 14, 16, matMadeira);
      bloco(10, 11.6, 0, 1.2, 14.4, 16, matMadeira);
   }
   /** Poço com brocal de pedra, tampo escuro (efeito de buraco), guarda-mão de madeira e telhado. */
   function construirPoco(){
      // Brocal do poço: cilindro maciço de pedra (raio 2.4) que forma o aro visível.
      cilindro(2.4, 1.3, 0, 0, 34, matPedraEsc);
      // Tampo escuro por cima, mais estreito (raio 2.0) e raso (0.2): não é um
      // buraco real, é só a cor escura simulando o interior/sombra do poço.
      // Decorativo (não colide), senão o jogador ficaria "preso" andando por cima.
      cilindro(2.0, 0.2, 0, 1.3, 34, matVao, false);
      // Guarda-mão de madeira nas laterais (norte/sul), apoiado no brocal
      bloco(-2.5, -1.9, 1.3, 4.2, 33.4, 34.6, matMadeira);
      bloco( 1.9,  2.5, 1.3, 4.2, 33.4, 34.6, matMadeira);
      // Telhado do poço (decorativo, não colide)
      bloco(-2.8,  2.8, 4.2, 5.0, 32.6, 35.4, matTelhado, false);
   }

   // ============================================================================
   // 8) ILHA DO CASTELO, ÁGUA E ACESSO EXTERNO (T2)
   //
   //    Como no castelo de referência (Bodiam), a entrada principal leva a uma
   //    ponte reta até uma pequena ilha OCTOGONAL, de onde um passadiço vira para
   //    o oeste até a margem. Tudo fica acima do plano base (água):
   //      ilha do castelo  -> topo em y = 0     (gramado)
   //      acesso           -> topo em y = -0.2  (gramado, ligeiramente mais baixo)
   //      trilha           -> topo em y = -0.08 (areia, sobre o gramado do acesso)
   // ============================================================================
   function construirIlhaEAcesso() {
      // --- Plano base: água ------------------------------------------------------
      const agua = new THREE.Mesh(new THREE.PlaneGeometry(1400, 1400), matAgua);
      agua.rotation.x = -Math.PI / 2;
      agua.position.y = NIVEL_AGUA;
      agua.name = 'agua';
      castelo.add(agua);

      // --- Ilha do castelo, com o poço da escotilha recortado via CSG ------------
      // O colisor é a caixa inteira (o jogador anda sobre a escotilha fechada; o
      // poço aberto é bloqueado por um colisor próprio, ver interior.js).
      const E = ESCOTILHA;
      const poco = solidoCSG(geometriaCilindro(E.raio, E.profundidade + 0.2, 40),
                             E.x, -E.profundidade / 2 + 0.1, E.z);
      blocoCSG(ILHA.x0, ILHA.x1, ILHA.yBase, 0, ILHA.z0, ILHA.z1, matGrama, [poco]);

      // Trilha de areia da entrada do castelo até a ponte
      bloco(-3.5, 3.5, 0, 0.1, ILHA.z0, -49, matAreia, false);

      // --- Acesso ----------------------------------------------------------------
      const yT = ACESSO.yTopo, yA = ACESSO.yAreia, yB = ILHA.yBase;
      const oct = { x: 0, z: -98, raio: 13 };                // ilha octogonal
      const apotema = oct.raio * Math.cos(Math.PI / 8);      // distância centro -> lado
      const zPonte1 = oct.z + apotema;                       // ponte encosta no lado do octógono
      const xMargem = -150;                                  // começo da margem (terra firme)
      const zPass0 = oct.z - 6, zPass1 = oct.z + 6;          // largura do passadiço

      // Ponte (aterro) da ilha do castelo até o octógono
      bloco(-6, 6, yB, yT, zPonte1, ILHA.z0, matGramaAc);
      bloco(-3.5, 3.5, yT, yA, zPonte1, ILHA.z0, matAreia, false);

      // Octógono: CylinderGeometry de 8 lados, girado 22,5° para ficar com um lado
      // virado para a ponte. O colisor é um cilindro com o raio do lado (apótema).
      const octo = new THREE.Mesh(new THREE.CylinderGeometry(oct.raio, oct.raio, yT - yB, 8), matGramaAc);
      octo.position.set(oct.x, (yT + yB) / 2, oct.z);
      octo.rotation.y = Math.PI / 8;
      castelo.add(octo);
      collision.addCylinder(octo, apotema * ESCALA);
      const octoAreia = new THREE.Mesh(new THREE.CylinderGeometry(9, 9, yA - yT, 8), matAreia);
      octoAreia.position.set(oct.x, (yT + yA) / 2, oct.z);
      octoAreia.rotation.y = Math.PI / 8;
      castelo.add(octoAreia);

      // Passadiço do octógono até a margem oeste
      bloco(xMargem, oct.x - apotema + 1, yB, yT, zPass0, zPass1, matGramaAc);
      bloco(xMargem - 60, oct.x - 8, yT, yA, oct.z - 3.5, oct.z + 3.5, matAreia, false);

      // Margem (terra firme)
      bloco(-600, xMargem, yB, yT, -600, 600, matGramaAc);

      // --- Barreiras invisíveis na beira d'água -----------------------------------
      // Ilha do castelo (aberta só onde a ponte chega)
      barreira(ILHA.x0, -6, ILHA.z0, ILHA.z0 + 0.6, 0);
      barreira(6, ILHA.x1, ILHA.z0, ILHA.z0 + 0.6, 0);
      barreira(ILHA.x0, ILHA.x1, ILHA.z1 - 0.6, ILHA.z1, 0);
      barreira(ILHA.x0, ILHA.x0 + 0.6, ILHA.z0, ILHA.z1, 0);
      barreira(ILHA.x1 - 0.6, ILHA.x1, ILHA.z0, ILHA.z1, 0);
      // Laterais da ponte
      barreira(-6, -5.4, zPonte1, ILHA.z0, yT);
      barreira(5.4, 6, zPonte1, ILHA.z0, yT);
      // Contorno do octógono (anel de pequenas caixas), aberto para a ponte (+z)
      // e para o passadiço (-x)
      const nAnel = 56, rAnel = apotema - 0.5;
      for (let i = 0; i < nAnel; i++) {
         const ang = (i / nAnel) * Math.PI * 2;
         const bx = Math.cos(ang) * rAnel, bz = Math.sin(ang) * rAnel;
         if (bz > 0 && Math.abs(bx) < 6.5) continue;   // saída para a ponte
         if (bx < 0 && Math.abs(bz) < 6.5) continue;   // saída para o passadiço
         barreira(oct.x + bx - 0.45, oct.x + bx + 0.45, oct.z + bz - 0.45, oct.z + bz + 0.45, yT);
      }
      // Laterais do passadiço
      barreira(xMargem, oct.x - apotema + 1.5, zPass0, zPass0 + 0.6, yT);
      barreira(xMargem, oct.x - apotema + 1.5, zPass1 - 0.6, zPass1, yT);
      // Beira da margem (aberta onde o passadiço chega) e limites do mapa
      barreira(xMargem - 0.6, xMargem, -600, zPass0, yT);
      barreira(xMargem - 0.6, xMargem, zPass1, 600, yT);
      barreira(-600, -599.4, -600, 600, yT);
      barreira(-600, xMargem, -600, -599.4, yT);
      barreira(-600, xMargem, 599.4, 600, yT);
   }

   // ----------------------------------------------------------------------------
   // Executa a construção na ordem em que o castelo é montado
   // ----------------------------------------------------------------------------
   construirIlhaEAcesso();
   construirMuralhas();
   construirTorresDeCanto();
   construirTorresIntermediarias();
   construirPortaria();
   construirAlojamentos();
   construirTorreDeMenagem();
   construirPatio();

   // ----------------------------------------------------------------------------
   // Interface pública do módulo
   // ----------------------------------------------------------------------------
   return {
      group: castelo,
      doors: doors,
      /**
       * Atualiza as animações das portas.
       * @param {number} delta tempo do quadro
       * @param {THREE.Vector3} posJogador posição do jogador (dispara a abertura)
       */
      update: function (delta, posJogador) {
         for (let i = 0; i < doors.length; i++) doors[i].update(delta, posJogador);
      }
   };
}

// =====================================================================================
// PORTA ANIMADA
// =====================================================================================
/**
 * Porta que abre/fecha automaticamente conforme a proximidade do jogador.
 *
 * O estado de abertura é um valor t em [0,1] que avança a uma velocidade constante.
 * Antes de ser aplicado, t passa por um smoothstep, o que dá aceleração e
 * desaceleração suaves ao movimento (a porta não "estala" no início nem no fim).
 *
 * Cada "trilha" descreve o que animar:
 *   { obj, propriedade: 'rotY' | 'posY', de, para }
 */
export class AnimatedDoor {
   constructor({ nome, trilhas, ponto, distancia, velocidade = 1.2, limiarColisao = 0.3 }) {
      this.nome          = nome;
      this.trilhas       = trilhas;
      this.ponto         = ponto;          // ponto de referência para a distância
      this.distancia     = distancia;      // raio de acionamento
      this.velocidade    = velocidade;     // fração da abertura por segundo
      this.limiarColisao = limiarColisao;  // a partir de que ponto deixa de bloquear
      this.t             = 0;              // 0 = fechada, 1 = totalmente aberta
      this._aplicar();
   }

   /**
    * Indica se a porta já liberou a passagem (o colisor é desligado).
    * Portas de dobradiça liberam cedo (a folha sai do vão logo no início do giro);
    * a grade do portão principal só libera quando já subiu quase todo o curso.
    */
   get aberta() { return this.t > this.limiarColisao; }

   /**
    * @param {number} delta
    * @param {THREE.Vector3} posJogador
    */
   update(delta, posJogador) {
      const dist = posJogador.distanceTo(this.ponto);
      const alvo = (dist < this.distancia) ? 1 : 0;
      if (this.t === alvo) return;

      const sentido = Math.sign(alvo - this.t);
      this.t = THREE.MathUtils.clamp(this.t + sentido * this.velocidade * delta, 0, 1);
      this._aplicar();
   }

   /** Aplica o estado atual (com suavização) em todas as trilhas. */
   _aplicar() {
      const s = this.t * this.t * (3 - 2 * this.t); // smoothstep
      for (let i = 0; i < this.trilhas.length; i++) {
         const tr = this.trilhas[i];
         const valor = THREE.MathUtils.lerp(tr.de, tr.para, s);
         if (tr.propriedade === 'rotY') tr.obj.rotation.y = valor;
         else                           tr.obj.position.y = valor;
      }
   }
}
