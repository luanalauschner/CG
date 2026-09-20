/**
 * =====================================================================================
 *  T1 - MODELAGEM DO AMBIENTE
 * =====================================================================================
 */

import * as THREE from 'three';
import { setDefaultMaterial } from '../libs/util/util.js';
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

// Ameias: 'vaoMax' precisa ser menor que o diâmetro do jogador (1.0 unidade)
// para que ele não consiga atravessar as ameias e cair fora do previsto.
const MERLAO = { largura: 1.8, vaoMax: 0.95, altura: 1.4, espessura: 0.8 };

const PORTAO = { meiaLargura: 4, altura: 10 };  // vão da entrada principal
const TORRE_CANTO = { raio: 8.5, altura: 30 }; // torres cilíndricas

// Fator de escala geral do castelo
// O jogador não é afetado - por isso o castelo fica maior/menor EM RELAÇÃO a ele.
export const ESCALA = 1.6;

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
   const matVao      = setDefaultMaterial("rgb(53, 42, 30)");    // aberturas escuras: seteiras, janelas, vãos decorativos e interior do poço

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
   // 1) MURALHAS EXTERNAS
   // ============================================================================
   function construirMuralhas() {
      const H = MURALHA.altura;

      // --- Muralha NORTE: interrompida pelo vão do portão principal --------------
      bloco(-42, -PORTAO.meiaLargura, 0, H, -FACE_EXT, -FACE_INT, matPedra); // trecho oeste
      bloco(PORTAO.meiaLargura, 42, 0, H, -FACE_EXT, -FACE_INT, matPedra);   // trecho leste
      // Verga sobre a passagem (o caminho de ronda passa por cima do portão)
      bloco(-PORTAO.meiaLargura, PORTAO.meiaLargura, PORTAO.altura, H,
            -FACE_EXT, -FACE_INT, matPedra);

      // --- Demais muralhas -------------------------------------------------------
      bloco(-42, 42, 0, H,  FACE_INT,  FACE_EXT, matPedra); // sul
      bloco(-FACE_EXT, -FACE_INT, 0, H, -42, 42, matPedra); // oeste

      // Muralha LESTE: dividida em dois trechos independentes.
      //  - Trecho de trás (torre intermediária -> torre de canto traseira,
      //    z positivo): reta, igual às demais muralhas.
      //  - Trecho da frente (torre de canto dianteira -> torre intermediária,
      //    z negativo): muralha "torta", com apenas 3 segmentos retos (não
      //    alinhados aos eixos) que saem da torre de canto, avançam em
      //    diagonal para fora, viram bruscamente (quase 180°) e voltam em
      //    diagonal até encontrar a torre intermediária.
      const zTorreInt = 6.5; // meia largura da torre intermediária (ver construirTorresIntermediarias)
      bloco(FACE_INT, FACE_EXT, 0, H, zTorreInt - (zTorreInt/2), 42, matPedra); // leste - trecho reto (traseiro)

      // trecho torto
      bloco(FACE_INT-5, FACE_EXT-5, 0, H, -42, zTorreInt -30, matPedra);
      bloco(FACE_INT, FACE_EXT, 0, H, zTorreInt -30, zTorreInt + (zTorreInt/2), matPedra)
      bloco(FACE_INT -5, FACE_EXT, 0, H, zTorreInt -35, zTorreInt-30, matPedra)

      /* // --- Cordão decorativo (faixa saliente) próximo ao topo, como em Bodiam ----
      const c0 = 29.4, c1 = 30.0, s = 0.35; // saliência
      bloco(-42, 42, c0, c1, -FACE_EXT - s, -FACE_EXT, matPedraEsc, false);
      bloco(-42, 42, c0, c1,  FACE_EXT,  FACE_EXT + s, matPedraEsc, false);
      bloco(-FACE_EXT - s, -FACE_EXT, c0, c1, -42, 42, matPedraEsc, false); */
      // Leste: só no trecho reto (o trecho torto da frente não tem face plana
      // para o cordão se apoiar).
      //cbloco( FACE_EXT,  FACE_EXT + s, c0, c1, zTorreInt, 42, matPedraEsc, false);

      // --- Ameias (merlões) na borda EXTERNA do caminho de ronda -----------------
      const yA0 = H, yA1 = H + MERLAO.altura;
      const e = MERLAO.espessura;

      // As fileiras são interrompidas onde há torres, pois o volume da torre já
      // fecha a borda.
      const T = 4.5;  // meia largura das torres quadradas intermediárias

      // Norte: interrompida por todo o bloco da portaria (x de -12 a 12)
      fileiraDeMerloes('x', -FACE_EXT, -FACE_EXT + e, -35, -12, yA0, yA1, matAmeia);
      fileiraDeMerloes('x', -FACE_EXT, -FACE_EXT + e,  12,  35, yA0, yA1, matAmeia);

      // Sul: interrompida apenas pela torre da poterna
      fileiraDeMerloes('x', FACE_EXT - e, FACE_EXT, -35, -T, yA0, yA1, matAmeia);
      fileiraDeMerloes('x', FACE_EXT - e, FACE_EXT,   T, 35, yA0, yA1, matAmeia);

      // Oeste: interrompida pela torre intermediária
      fileiraDeMerloes('z', -FACE_EXT, -FACE_EXT + e, -35, -T, yA0, yA1, matAmeia);
      fileiraDeMerloes('z', -FACE_EXT, -FACE_EXT + e,   T, 35, yA0, yA1, matAmeia);
      // Leste: trecho reto (traseiro)
      fileiraDeMerloes('z',  FACE_EXT - e, FACE_EXT,    T, 35, yA0, yA1, matAmeia);

      // Leste: trecho torto (frente) - ameias acompanhando o contorno externo
      // do zigue-zague (recuo -> degrau de ligação -> volta à posição normal,
      // ver os 3 blocos do "trecho torto" acima). Mesmo padrão de
      // coroarTorreQuadrada(): a fileira que atravessa a quina (eixo x) fica
      // inteira, e as que chegam nela (eixo z) são encurtadas em 'e' para não
      // se sobrepor.
      const zDegrau = zTorreInt - 35; // z do degrau que liga os dois trechos retos
      fileiraDeMerloes('z', FACE_EXT - 5 - e, FACE_EXT - 5, -42, zDegrau - e, yA0, yA1, matAmeia); // trecho recuado
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
   // 2) TORRES CILÍNDRICAS DE CANTO
   // ============================================================================
   function construirTorresDeCanto() {
      const canto = 40
      const cantos = [[-canto, -canto], [canto, -canto], [-canto, canto], [canto, canto]];

      for (const [x, z] of cantos) {
         // Corpo da torre (colide como cilindro - o jogador desliza contornando)
         cilindro(TORRE_CANTO.raio, TORRE_CANTO.altura, x, 0, z, matPedraEsc);
         // Cornija saliente no topo
         cilindro(TORRE_CANTO.raio + 0.7, 0.8, x, TORRE_CANTO.altura - 0.6, z,
                  matPedra, false);

         // Coroa de merlões: 'n' blocos distribuídos em círculo no topo da torre,
         // cada um rotacionado para apontar radialmente para fora.
         // Puramente decorativo: como o jogador nunca alcança o topo da torre de
         // canto (sem escada até lá), estes merlões NÃO são registrados
         // como colisores (não passam por bloco(), que faz isso por padrão).
         const n = 14;
         for (let i = 0; i < n; i++) {
            const ang = (i / n) * Math.PI * 2;
            const m   = new THREE.Mesh(geometriaBox(1.5, MERLAO.altura, 0.9), matAmeia);
            m.position.set(x + Math.cos(ang) * (TORRE_CANTO.raio - 0.2),
                           TORRE_CANTO.altura + 0.2 + MERLAO.altura / 2,
                           z + Math.sin(ang) * (TORRE_CANTO.raio - 0.2));
            m.rotation.y = -ang; // faces voltadas para fora
            castelo.add(m);
         }

         // Seteiras (frestas) em espiral subindo pelo corpo da torre: a cada
         // passo 'k' o ângulo avança 0.9 rad (~51,6°), então em 16 passos o
         // ângulo dá mais de 2 voltas completas (16*0.9 ≈ 14,4 rad) - o
         // resultado é uma fileira de seteiras espalhada por toda a
         // circunferência da torre, não só numa fatia. Também decorativo/sem
         // colisão, pelo mesmo motivo dos merlões acima.
         // A faixa de alturas é proporcional a TORRE_CANTO.altura (em vez de
         // um passo fixo), deixando uma margem embaixo e outra em cima (antes
         // da cornija/merlões) - assim as seteiras nunca saem da torre, não
         // importa o quão alta ou baixa ela esteja configurada.
         const margemBaseSeteiras = 5, margemTopoSeteiras = 6;
         const faixaSeteiras = Math.max(0, TORRE_CANTO.altura - margemBaseSeteiras - margemTopoSeteiras);
         for (let k = 0; k < 16; k++) {
            const ang = -Math.PI / 4 + k * 0.9;
            const s   = new THREE.Mesh(geometriaBox(0.5, 2.2, 0.4), matVao);
            s.position.set(x + Math.cos(ang) * (TORRE_CANTO.raio - 0.1),
                           margemBaseSeteiras + (k / 15) * faixaSeteiras,
                           z + Math.sin(ang) * (TORRE_CANTO.raio - 0.1));
            s.rotation.y = -ang;
            castelo.add(s);
         }
      }
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

      // Leste: corpo da torre + coroa de merlões + seteira decorativa na face externa
      bloco(FACE_EXT - 1, FACE_EXT + saliencia, 0, H, -meiaLargura, meiaLargura, matPedraEsc);
      coroarTorreQuadrada(FACE_EXT - 1, FACE_EXT + saliencia, -meiaLargura, meiaLargura, H);
      bloco(FACE_EXT + saliencia - 0.1, FACE_EXT + saliencia + 0.1, 8, 11, -0.6, 0.6, matVao, false); // seteira

      // Oeste: mesma estrutura da torre leste, espelhada em X
      bloco(-FACE_EXT - saliencia, -FACE_EXT + 1, 0, H, -meiaLargura, meiaLargura, matPedraEsc);
      coroarTorreQuadrada(-FACE_EXT - saliencia, -FACE_EXT + 1, -meiaLargura, meiaLargura, H);
      bloco(-FACE_EXT - saliencia - 0.1, -FACE_EXT - saliencia + 0.1, 8, 11, -0.6, 0.6, matVao, false); // seteira

      // Sul (torre da poterna): mesma estrutura, girada 90° (avança em Z)
      bloco(-meiaLargura, meiaLargura, 0, H, FACE_EXT - 1, FACE_EXT + saliencia, matPedraEsc);
      coroarTorreQuadrada(-meiaLargura, meiaLargura, FACE_EXT - 1, FACE_EXT + saliencia, H);
      bloco(-0.6, 0.6, 8, 11, FACE_EXT + saliencia - 0.1, FACE_EXT + saliencia + 0.1, matVao, false); // seteira
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

      // Duas torres retangulares ladeando a passagem
      bloco(L, L + 8, 0, Htorres, zFrente, zFundo, matPedraEsc);      // torre leste
      bloco(-L - 8, -L, 0, Htorres, zFrente, zFundo, matPedraEsc);    // torre oeste
      coroarTorreQuadrada(L, L + 8, zFrente, zFundo, Htorres);
      coroarTorreQuadrada(-L - 8, -L, zFrente, zFundo, Htorres);

      // Bloco central: mesmo tamanho das torres, só que recuado em Z (passa
      // através da muralha, saindo um pouco do outro lado) e começa em
      // PORTAO.altura (fica "pousado" sobre a verga do vão, como na muralha
      // norte) - por isso usa matPedra (cor da muralha) e não matPedraEsc
      // (cor das torres), reforçando visualmente que é parte da própria parede.
      bloco(-L, L, PORTAO.altura, Htorres, zFrente + recuo, zFundo + recuo, matPedra); // bloco central da portaria
      coroarTorreQuadrada(-L, L, zFrente + recuo, zFundo + recuo, Htorres);

      // Vãos decorativos (seteiras/janelas escuras) na fachada frontal da portaria
      bloco(-0.8, 0.8, 30, 33.5, zFrente - 0.15, zFrente + 1, matVao, false);          // vão central, acima da entrada
      bloco(-L - 5.6, -L - 4.4, 9, 12.5, zFrente - 0.15, zFrente + 0.1, matVao, false); // seteira na torre esquerda (oeste)
      bloco(L + 4.4, L + 5.6, 9, 12.5, zFrente - 0.15, zFrente + 0.1, matVao, false);   // seteira na torre direita (leste)

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
      // Moldura de pedra do vão
      bloco(-L - 0.6, -L, 0, PORTAO.altura + 0.6, zFrente + 2.4, zFrente + 3.6, matPedra, false);
      bloco(L, L + 0.6, 0, PORTAO.altura + 0.6, zFrente + 2.4, zFrente + 3.6, matPedra, false);
      bloco(-L - 0.6, L + 0.6, PORTAO.altura, PORTAO.altura + 0.6,
            zFrente + 2.4, zFrente + 3.6, matPedra, false);
      

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
      // Calçada ligando o portão às duas construções
      bloco(-3, 3, 0, 0.15, -38, 38, matPedraEsc, false);
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
   // ----------------------------------------------------------------------------
   // Executa a construção na ordem em que o castelo é montado
   // ----------------------------------------------------------------------------
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
