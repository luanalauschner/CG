/**
 * =====================================================================================
 *  T1 - MODELAGEM DO AMBIENTE
 * =====================================================================================
 *  Constrói o castelo inspirado no Castelo de Bodiam (Inglaterra) usando APENAS
 *  primitivas do three.js (BoxGeometry e CylinderGeometry) e o material padrão
 *  exigido no enunciado: setDefaultMaterial(cor).
 *
 *  ESTRUTURA GERAL (vista de cima, X para leste, -Z para o norte)
 *  ---------------------------------------------------------------
 *          NORTE  (portaria + porta principal / grade)
 *       +---#---------[ PORTARIA ]---------#---+
 *       |   O                               O  |   O = torre cilíndrica de canto
 *       |                                      |   # = torre quadrada (avança p/ fora)
 *   [T] |   [ ALOJAMENTOS ]   [ TORRE DE   ]   | [T]
 *  OESTE|   (porta + escada)  [  MENAGEM   ]   | LESTE
 *       |                     (porta+escada)   |
 *       |   O          escada -> muralha    O  |
 *       +---#-------------[T]------------------+
 *          SUL            (brecha p/ testar queda)
 *
 *  ELEMENTOS EXIGIDOS PELO ENUNCIADO
 *   - Parte externa fiel: muralhas, 4 torres cilíndricas de canto, 3 torres
 *     quadradas intermediárias, portaria com duas torres e ameias (merlões);
 *   - Parte interna: 2 construções, cada uma com escada para o pavimento superior;
 *   - Escada de acesso ao topo da muralha;
 *   - 3 portas com animação: grade principal (sobe) + 2 portas de dobradiça (giram);
 *   - Uma BRECHA na muralha sul, sem ameias, para testar a queda suave.
 * =====================================================================================
 */

import * as THREE from 'three';
import { setDefaultMaterial } from '../libs/util/util.js';

// =====================================================================================
// DIMENSÕES GERAIS DO CASTELO (todas em "unidades" ~ metros)
// =====================================================================================
const MURALHA = {
   meio:      40,   // distância do centro até a linha média de cada muralha
   espessura:  4,   // espessura da muralha (também é a largura do caminho de ronda)
   altura:    14    // altura do topo da muralha (piso do caminho de ronda)
};
const FACE_INT = MURALHA.meio - MURALHA.espessura / 2; // 38 - face interna
const FACE_EXT = MURALHA.meio + MURALHA.espessura / 2; // 42 - face externa

// Ameias: 'vaoMax' precisa ser menor que o diâmetro do jogador (1.0 unidade)
// para que ele não consiga atravessar as ameias e cair fora do previsto.
const MERLAO = { largura: 1.8, vaoMax: 0.95, altura: 1.4, espessura: 0.8 };

const PORTAO = { meiaLargura: 4, altura: 9 };  // vão da entrada principal
const TORRE_CANTO = { raio: 5.5, altura: 20 }; // torres cilíndricas

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

   // ----------------------------------------------------------------------------
   // MATERIAIS - conforme o enunciado, todos criados com setDefaultMaterial(cor)
   // ----------------------------------------------------------------------------
   const matPedra    = setDefaultMaterial("rgb(158,152,140)"); // muralhas
   const matPedraEsc = setDefaultMaterial("rgb(132,126,116)"); // torres / detalhes
   const matAmeia    = setDefaultMaterial("rgb(172,166,154)"); // merlões
   const matDegrau   = setDefaultMaterial("rgb(140,134,124)"); // escadas
   const matPredio   = setDefaultMaterial("rgb(176,168,152)"); // construções internas
   const matTelhado  = setDefaultMaterial("rgb(122,62,48)");   // coberturas
   const matMadeira  = setDefaultMaterial("rgb(104,66,38)");   // portas
   const matFerro    = setDefaultMaterial("rgb(62,62,68)");    // grade do portão
   const matVao      = setDefaultMaterial("rgb(38,34,30)");    // seteiras / janelas
   const matEntulho  = setDefaultMaterial("rgb(146,140,130)"); // entulho da brecha

   const doors = []; // portas animadas criadas ao longo da modelagem

   // ============================================================================
   // FERRAMENTAS DE CONSTRUÇÃO
   // ============================================================================

   /**
    * Cria um paralelepípedo a partir dos seus LIMITES (mínimo/máximo em cada eixo).
    * Trabalhar com limites (e não com centro+tamanho) deixa o código do layout
    * muito mais legível e faz o registro do colisor ser exato.
    *
    * @param {boolean} colide se false, é apenas decoração (não entra na colisão)
    */
   function bloco(x0, x1, y0, y1, z0, z1, material, colide = true) {
      const geo = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0);
      const mesh = new THREE.Mesh(geo, material);
      mesh.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
      castelo.add(mesh);
      if (colide) collision.addBox(mesh);
      return mesh;
   }

   /**
    * Cria um cilindro vertical (torres, poço, barris).
    * @param {number} yBase base do cilindro
    */
   function cilindro(raio, altura, x, yBase, z, material, colide = true, lados = 28) {
      const geo = new THREE.CylinderGeometry(raio, raio, altura, lados);
      const mesh = new THREE.Mesh(geo, material);
      mesh.position.set(x, yBase + altura / 2, z);
      castelo.add(mesh);
      if (colide) collision.addCylinder(mesh, raio);
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
    * entre as ameias - as únicas saídas são as previstas no projeto (a brecha da
    * muralha sul e as bordas internas do caminho de ronda).
    *
    * Trechos sem ameias (torres, brecha, chegada de escadas) são obtidos
    * chamando esta função uma vez para cada intervalo contíguo.
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
    * Cria uma escada de degraus maciços.
    * Cada degrau é um bloco que vai da base até a sua altura, formando um
    * perfil escalonado sólido. Como o desnível de cada degrau é menor que
    * STEP_HEIGHT (collision.js), o personagem sobe sem travar e sem sobressaltos.
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
            bloco(de, ate, p.baseY, topo, p.lat0, p.lat1, matDegrau);
            if (mureta > 0 && lados[0])
               bloco(de, ate, topo, topo + mureta, p.lat0 - espMur, p.lat0, matDegrau);
            if (mureta > 0 && lados[1])
               bloco(de, ate, topo, topo + mureta, p.lat1, p.lat1 + espMur, matDegrau);
         } else {
            bloco(p.lat0, p.lat1, p.baseY, topo, de, ate, matDegrau);
            if (mureta > 0 && lados[0])
               bloco(p.lat0 - espMur, p.lat0, topo, topo + mureta, de, ate, matDegrau);
            if (mureta > 0 && lados[1])
               bloco(p.lat1, p.lat1 + espMur, topo, topo + mureta, de, ate, matDegrau);
         }
      }
   }

   /**
    * Cria uma parede com um vão de porta no meio: duas laterais + verga em cima.
    * O vão fica entre 'vao0' e 'vao1' e tem 'alturaVao' de altura livre.
    *
    * @param {string} eixo 'x' se a parede é perpendicular a X (vão medido em Z)
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
      bloco( FACE_INT,  FACE_EXT, 0, H, -42, 42, matPedra); // leste

      // --- Cordão decorativo (faixa saliente) próximo ao topo, como em Bodiam ----
      const c0 = 12.4, c1 = 13.0, s = 0.35; // saliência
      bloco(-42, 42, c0, c1, -FACE_EXT - s, -FACE_EXT, matPedraEsc, false);
      bloco(-42, 42, c0, c1,  FACE_EXT,  FACE_EXT + s, matPedraEsc, false);
      bloco(-FACE_EXT - s, -FACE_EXT, c0, c1, -42, 42, matPedraEsc, false);
      bloco( FACE_EXT,  FACE_EXT + s, c0, c1, -42, 42, matPedraEsc, false);

      // --- Ameias (merlões) na borda EXTERNA do caminho de ronda -----------------
      const yA0 = H, yA1 = H + MERLAO.altura;
      const e   = MERLAO.espessura;

      // As fileiras são interrompidas onde há torres (o volume da torre já fecha
      // a borda) e, na muralha sul, no trecho reservado à brecha.
      const T = 4.5;  // meia largura das torres quadradas intermediárias

      // Norte: interrompida por todo o bloco da portaria (x de -12 a 12)
      fileiraDeMerloes('x', -FACE_EXT, -FACE_EXT + e, -35, -12, yA0, yA1, matAmeia);
      fileiraDeMerloes('x', -FACE_EXT, -FACE_EXT + e,  12,  35, yA0, yA1, matAmeia);

      // Sul: interrompida pela torre da poterna e pela BRECHA (x de 6 a 16)
      fileiraDeMerloes('x', FACE_EXT - e, FACE_EXT, -35, -T, yA0, yA1, matAmeia);
      fileiraDeMerloes('x', FACE_EXT - e, FACE_EXT,   T,  6, yA0, yA1, matAmeia);
      fileiraDeMerloes('x', FACE_EXT - e, FACE_EXT,  16, 35, yA0, yA1, matAmeia);

      // Oeste e Leste: interrompidas pelas suas torres intermediárias
      fileiraDeMerloes('z', -FACE_EXT, -FACE_EXT + e, -35, -T, yA0, yA1, matAmeia);
      fileiraDeMerloes('z', -FACE_EXT, -FACE_EXT + e,   T, 35, yA0, yA1, matAmeia);
      fileiraDeMerloes('z',  FACE_EXT - e, FACE_EXT,  -35, -T, yA0, yA1, matAmeia);
      fileiraDeMerloes('z',  FACE_EXT - e, FACE_EXT,    T, 35, yA0, yA1, matAmeia);

      // --- BRECHA: trecho arruinado da muralha sul (x de 6 a 16) -----------------
      // O topo é rebaixado e não há merlões: o jogador anda para fora e CAI.
      // A queda é resolvida pela gravidade do sistema de colisão (movimento suave).
      bloco(6, 16, H, H + 0.4, FACE_EXT - 1.2, FACE_EXT, matEntulho);
      // Entulho no chão, fora da muralha, marcando o ponto da brecha
      bloco(7.5, 11.5, 0, 1.6, FACE_EXT + 1.5, FACE_EXT + 5.0, matEntulho);
      bloco(11.0, 14.5, 0, 1.0, FACE_EXT + 2.5, FACE_EXT + 6.5, matEntulho);
      bloco(9.0, 12.0, 0, 2.4, FACE_EXT + 5.5, FACE_EXT + 8.0, matEntulho);
   }

   // ============================================================================
   // 2) TORRES CILÍNDRICAS DE CANTO
   // ============================================================================
   function construirTorresDeCanto() {
      const cantos = [[-40, -40], [40, -40], [-40, 40], [40, 40]];

      for (const [x, z] of cantos) {
         // Corpo da torre (colide como cilindro - o jogador desliza contornando)
         cilindro(TORRE_CANTO.raio, TORRE_CANTO.altura, x, 0, z, matPedraEsc);
         // Cornija saliente no topo
         cilindro(TORRE_CANTO.raio + 0.7, 0.8, x, TORRE_CANTO.altura - 0.6, z,
                  matPedra, false);

         // Coroa de merlões (decorativa - o topo das torres não é acessível no T1)
         const n = 14;
         for (let i = 0; i < n; i++) {
            const ang = (i / n) * Math.PI * 2;
            const geo = new THREE.BoxGeometry(1.5, MERLAO.altura, 0.9);
            const m   = new THREE.Mesh(geo, matAmeia);
            m.position.set(x + Math.cos(ang) * (TORRE_CANTO.raio - 0.2),
                           TORRE_CANTO.altura + 0.2 + MERLAO.altura / 2,
                           z + Math.sin(ang) * (TORRE_CANTO.raio - 0.2));
            m.rotation.y = -ang; // faces voltadas para fora
            castelo.add(m);
         }

         // Seteiras (frestas) espalhadas pelo corpo da torre
         for (let k = 0; k < 3; k++) {
            const ang = -Math.PI / 4 + k * 0.9;
            const geo = new THREE.BoxGeometry(0.5, 2.2, 0.4);
            const s   = new THREE.Mesh(geo, matVao);
            s.position.set(x + Math.cos(ang) * (TORRE_CANTO.raio - 0.1),
                           6 + k * 4,
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
      const H = 18, saliencia = 7, meiaLargura = 4.5;

      // Leste
      bloco(FACE_EXT - 1, FACE_EXT + saliencia, 0, H, -meiaLargura, meiaLargura, matPedraEsc);
      coroarTorreQuadrada(FACE_EXT - 1, FACE_EXT + saliencia, -meiaLargura, meiaLargura, H);
      bloco(FACE_EXT + saliencia - 0.1, FACE_EXT + saliencia + 0.1, 8, 11, -0.6, 0.6, matVao, false);

      // Oeste
      bloco(-FACE_EXT - saliencia, -FACE_EXT + 1, 0, H, -meiaLargura, meiaLargura, matPedraEsc);
      coroarTorreQuadrada(-FACE_EXT - saliencia, -FACE_EXT + 1, -meiaLargura, meiaLargura, H);
      bloco(-FACE_EXT - saliencia - 0.1, -FACE_EXT - saliencia + 0.1, 8, 11, -0.6, 0.6, matVao, false);

      // Sul (torre da poterna)
      bloco(-meiaLargura, meiaLargura, 0, H, FACE_EXT - 1, FACE_EXT + saliencia, matPedraEsc);
      coroarTorreQuadrada(-meiaLargura, meiaLargura, FACE_EXT - 1, FACE_EXT + saliencia, H);
      bloco(-0.6, 0.6, 8, 11, FACE_EXT + saliencia - 0.1, FACE_EXT + saliencia + 0.1, matVao, false);
   }

   // ============================================================================
   // 4) PORTARIA (norte) + PORTA PRINCIPAL ANIMADA (grade que sobe)
   // ============================================================================
   function construirPortaria() {
      const H = 20;
      const zFrente = -49, zFundo = -41;
      const L = PORTAO.meiaLargura;   // 4

      // Duas torres retangulares ladeando a passagem
      bloco(L, L + 8, 0, H, zFrente, zFundo, matPedraEsc);      // torre leste
      bloco(-L - 8, -L, 0, H, zFrente, zFundo, matPedraEsc);    // torre oeste
      coroarTorreQuadrada(L, L + 8, zFrente, zFundo, H);
      coroarTorreQuadrada(-L - 8, -L, zFrente, zFundo, H);

      // Fachada acima da passagem, unindo as duas torres
      bloco(-L, L, PORTAO.altura, H, zFrente, zFundo, matPedraEsc);
      coroarTorreQuadrada(-L, L, zFrente, zFundo, H);

      // Matacães (faixa saliente sobre a entrada) e seteiras na fachada
      bloco(-L - 8.5, L + 8.5, 15.5, 16.6, zFrente - 1.0, zFrente, matPedra, false);
      bloco(-1.2, 1.2, 11, 14, zFrente - 0.15, zFrente + 0.1, matVao, false);
      bloco(-L - 5.6, -L - 4.4, 9, 12.5, zFrente - 0.15, zFrente + 0.1, matVao, false);
      bloco(L + 4.4, L + 5.6, 9, 12.5, zFrente - 0.15, zFrente + 0.1, matVao, false);

      // ---------------------------------------------------------------------
      // PORTA 1: grade (portcullis) que DESLIZA PARA CIMA
      // ---------------------------------------------------------------------
      const grade = new THREE.Group();
      grade.position.set(0, 0, zFrente + 3); // dentro do túnel de entrada
      castelo.add(grade);

      const barra = 0.22;
      // Barras verticais (9 barras simétricas, de -3.6 a 3.6)
      for (let x = -3.6; x <= 3.6 + 1e-6; x += 0.9) {
         const g = new THREE.Mesh(new THREE.BoxGeometry(barra, PORTAO.altura, barra), matFerro);
         g.position.set(x, PORTAO.altura / 2, 0);
         grade.add(g);
      }
      // Barras horizontais
      for (let y = 0.6; y <= PORTAO.altura - 0.3; y += 1.5) {
         const g = new THREE.Mesh(new THREE.BoxGeometry(2 * L - 0.4, barra, barra * 0.8), matFerro);
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
         ponto: new THREE.Vector3(0, 2, zFrente + 3),
         distancia: 14,
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

      // Paredes (a face leste tem o vão da porta)
      bloco(x0, x0 + esp, 0, H, z0, z1, matPredio);          // oeste
      bloco(x0, x1, 0, H, z0, z0 + esp, matPredio);          // norte
      bloco(x0, x1, 0, H, z1 - esp, z1, matPredio);          // sul
      paredeComVao('x', x1 - esp, x1, 0, H, z0, z1, -2, 2, 6, matPredio); // leste + vão

      // Laje do terraço
      bloco(x0, x1, H, lajeTopo, z0, z1, matPredio);

      // Parapeito do terraço. A fileira norte é dividida em duas para deixar
      // livre a abertura (x de -25.5 a -21.5) onde a escada externa chega.
      const p = 0.6, ph = 1.0;
      fileiraDeMerloes('x', z0, z0 + p, x0, -25.5, lajeTopo, lajeTopo + ph, matAmeia);
      fileiraDeMerloes('x', z0, z0 + p, -21.5, x1, lajeTopo, lajeTopo + ph, matAmeia);
      fileiraDeMerloes('x', z1 - p, z1, x0, x1, lajeTopo, lajeTopo + ph, matAmeia);
      fileiraDeMerloes('z', x0, x0 + p, z0 + p, z1 - p, lajeTopo, lajeTopo + ph, matAmeia);
      fileiraDeMerloes('z', x1 - p, x1, z0 + p, z1 - p, lajeTopo, lajeTopo + ph, matAmeia);

      // Janelas na fachada leste (decorativas)
      for (const z of [-8, -5, 5, 8]) {
         bloco(x1 - 0.1, x1 + 0.12, 3.5, 6.0, z - 0.6, z + 0.6, matVao, false);
      }

      // Escada externa ao norte: sobe no sentido +X até o nível do terraço.
      // A mureta só existe do lado de fora (lat0); do lado do prédio ela fecharia
      // a abertura por onde se entra no terraço.
      escada({
         eixo: 'x', inicio: x0, sentido: +1, lat0: -15.5, lat1: -12,
         baseY: 0, degraus: 16, espelho: lajeTopo / 16, piso: 0.7,
         mureta: 1.0, muretas: [true, false]
      });

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
         ponto: new THREE.Vector3(xPorta, 1.5, 0),
         distancia: 7,
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

      bloco(x1 - esp, x1, 0, H, z0, z1, matPredio);   // leste
      bloco(x0, x1, 0, H, z0, z0 + esp, matPredio);   // norte
      bloco(x0, x1, 0, H, z1 - esp, z1, matPredio);   // sul
      paredeComVao('x', x0, x0 + esp, 0, H, z0, z1, -2, 2, 6, matPredio); // oeste + vão

      // Laje do terraço e ameias em volta. A fileira sul é dividida em duas para
      // deixar livre a abertura (x de 18 a 21.5) onde a escada externa chega.
      bloco(x0, x1, H, lajeTopo, z0, z1, matPredio);
      const e = 0.7, ay = lajeTopo + MERLAO.altura;
      fileiraDeMerloes('x', z0, z0 + e, x0, x1, lajeTopo, ay, matAmeia);
      fileiraDeMerloes('x', z1 - e, z1, x0, 18, lajeTopo, ay, matAmeia);
      fileiraDeMerloes('x', z1 - e, z1, 21.5, x1, lajeTopo, ay, matAmeia);
      fileiraDeMerloes('z', x0, x0 + e, z0 + e, z1 - e, lajeTopo, ay, matAmeia);
      fileiraDeMerloes('z', x1 - e, x1, z0 + e, z1 - e, lajeTopo, ay, matAmeia);

      // Contrafortes nos cantos (avançam para FORA), reforçando a silhueta de torre
      for (const [cx, cz] of [[x0, z0], [x0, z1], [x1, z0], [x1, z1]]) {
         const sx = (cx === x0) ? -1 : 1;
         const sz = (cz === z0) ? -1 : 1;
         bloco(Math.min(cx, cx + sx * 2.4), Math.max(cx, cx + sx * 2.4), 0, H + 1.4,
               Math.min(cz, cz + sz * 2.4), Math.max(cz, cz + sz * 2.4), matPedraEsc);
      }

      // Janelas decorativas
      for (const z of [-6, 0, 6]) {
         bloco(x0 - 0.12, x0 + 0.1, 7.5, 10.0, z - 0.6, z + 0.6, matVao, false);
      }

      // Escada externa ao sul: sobe no sentido -X até o terraço
      // (mureta apenas no lado externo, lat1)
      escada({
         eixo: 'x', inicio: x1, sentido: -1, lat0: 10, lat1: 13,
         baseY: 0, degraus: 21, espelho: lajeTopo / 21, piso: 0.7,
         mureta: 1.0, muretas: [false, true]
      });

      // ---------------------------------------------------------------------
      // PORTA 3: folha única de madeira que GIRA para dentro
      // ---------------------------------------------------------------------
      const xPorta = x0 + esp / 2;
      const eF     = 0.3;               // espessura da folha
      const folha  = criarFolhaDePorta(xPorta, -2 + eF / 2, 4 - eF / 2, 6, eF, matMadeira, +1);

      const portaMenagem = new AnimatedDoor({
         nome: "Porta da torre de menagem",
         trilhas: [{ obj: folha.pivo, propriedade: 'rotY', de: 0, para: Math.PI / 2 }],
         ponto: new THREE.Vector3(xPorta, 1.5, 0),
         distancia: 7,
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

      const mesh = new THREE.Mesh(new THREE.BoxGeometry(esp, alt, larg), material);
      mesh.position.set(0, alt / 2, sentido * larg / 2);
      pivo.add(mesh);

      // Travessas de reforço (detalhe da porta de madeira)
      for (const h of [alt * 0.25, alt * 0.75]) {
         const t = new THREE.Mesh(new THREE.BoxGeometry(esp * 1.6, 0.25, larg * 0.9), matFerro);
         t.position.set(0, h, sentido * larg / 2);
         pivo.add(t);
      }
      return { pivo, mesh };
   }

   // ============================================================================
   // 7) ESCADA DE ACESSO AO TOPO DA MURALHA (pátio -> caminho de ronda sul)
   // ============================================================================
   function construirEscadaDaMuralha() {
      const degraus = 25;
      escada({
         eixo: 'z', inicio: FACE_INT - degraus * 0.7, sentido: +1,
         lat0: -24, lat1: -20,
         baseY: 0, degraus: degraus, espelho: MURALHA.altura / degraus,
         piso: 0.7, mureta: 1.0
      });
   }

   // ============================================================================
   // 8) DETALHES DO PÁTIO (poço, barris, calçada)
   // ============================================================================
   function construirPatio() {
      // Calçada ligando o portão às duas construções
      bloco(-3, 3, 0, 0.15, -38, 20, matPedraEsc, false);
      bloco(-16, 14, 0, 0.15, -3, 3, matPedraEsc, false);

      // Poço no centro-sul do pátio
      cilindro(2.4, 1.3, 0, 0, 16, matPedraEsc);
      cilindro(2.0, 0.2, 0, 1.3, 16, matVao, false);
      bloco(-2.5, -1.9, 1.3, 4.2, 15.4, 16.6, matMadeira);
      bloco( 1.9,  2.5, 1.3, 4.2, 15.4, 16.6, matMadeira);
      bloco(-2.8,  2.8, 4.2, 5.0, 14.6, 17.4, matTelhado, false);

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

   // ----------------------------------------------------------------------------
   // Executa a construção na ordem em que o castelo é montado
   // ----------------------------------------------------------------------------
   construirMuralhas();
   construirTorresDeCanto();
   construirTorresIntermediarias();
   construirPortaria();
   construirAlojamentos();
   construirTorreDeMenagem();
   construirEscadaDaMuralha();
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
      const alvo = (posJogador.distanceTo(this.ponto) < this.distancia) ? 1 : 0;
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
