/**
 * =====================================================================================
 *  T2 - INTERIOR DO CASTELO: PEDESTAIS, ESCOTILHA E PORTAL
 * =====================================================================================
 *    No pátio fica uma praça circular com uma escotilha no chão, cercada por quatro
 *  pedestais. Ao chegar perto de um pedestal carregando uma chave, a chave é
 *  colocada sobre ele e uma luz pontual acende.
 * 
 *    Com as quatro chaves posicionadas, as duas folhas da escotilha se abrem e o
 *  poço é revelado.
 *
 *    Todas as peças usam MeshLambertMaterial.
 * =====================================================================================
 */

import * as THREE from 'three';
import { setDefaultMaterial } from '../libs/util/util.js';
import { CSG } from '../libs/other/CSGMesh.js';
import { ESCALA, ESCOTILHA } from './environment.js';

// Criando os objetos do interior do castelo: praça, aro, escotilha, pedestais e portal.

const PRACA    = { raio: 8, altura: 0.12 };
const PEDESTAL = { distancia: 5.5, altura: 1.05 };   // distância até o centro da escotilha
const ARO      = { raioExt: 3.6, altura: 0.35 };     // aro de pedra em volta da escotilha
const RAIO_CHAVE = 0.28;                            // raio da chave (esfera) em unidades do castelo

/**
 * @param {THREE.Scene} scene
 * @param {CollisionSystem} collision
 */
export function createInterior(scene, collision) {
   const grupo = new THREE.Group();
   grupo.scale.setScalar(ESCALA);
   grupo.position.set(ESCOTILHA.x * ESCALA, 0, ESCOTILHA.z * ESCALA); // origem = centro da escotilha
   scene.add(grupo);
   grupo.updateMatrixWorld(true);

   const matPedra   = setDefaultMaterial("rgb(196,188,172)");
   const matPedraEs = setDefaultMaterial("rgb(150,142,128)");
   const matMadeira = setDefaultMaterial("rgb(96,62,36)");
   const matFerro   = setDefaultMaterial("rgb(60,60,66)");
   const matPoco    = setDefaultMaterial("rgb(70,64,58)");
   const matPortal  = new THREE.MeshLambertMaterial({ color: "rgb(40,20,70)",
                                                      emissive: "rgb(30,10,60)" });
   const matAnel    = new THREE.MeshLambertMaterial({ color: "rgb(120,200,255)",
                                                      emissive: "rgb(20,40,70)" });

   /** Converte uma geometria posicionada em sólido CSG padrão de examples/geometryCSG.js. */
   function solido(geometria, x, y, z) {
      const m = new THREE.Mesh(geometria);
      m.position.set(x, y, z);
      m.updateMatrix();
      return CSG.fromMesh(m);
   }

   // ----------------------------------------------------------------------------
   // PRAÇA E ARO CSG: disco menos o furo da escotilha
   // ----------------------------------------------------------------------------
   const furo = solido(new THREE.CylinderGeometry(ESCOTILHA.raio, ESCOTILHA.raio, 2, 40), 0, 0, 0);

   const praca = CSG.toMesh(
      solido(new THREE.CylinderGeometry(PRACA.raio, PRACA.raio, PRACA.altura, 48), 0, PRACA.altura / 2, 0)
         .subtract(furo), new THREE.Matrix4(), matPedraEs);
   grupo.add(praca);

   const aro = CSG.toMesh(
      solido(new THREE.CylinderGeometry(ARO.raioExt, ARO.raioExt, ARO.altura, 48), 0, ARO.altura / 2, 0)
         .subtract(furo), new THREE.Matrix4(), matPedra);
   grupo.add(aro);

   // ----------------------------------------------------------------------------
   // PORTAL: fundo luminoso do poço + anéis girando + luz 
   // ----------------------------------------------------------------------------
   const yFundo = -ESCOTILHA.profundidade + 0.05;
   const fundo = new THREE.Mesh(new THREE.CircleGeometry(ESCOTILHA.raio, 40), matPortal);
   fundo.rotation.x = -Math.PI / 2;
   fundo.position.y = yFundo;
   grupo.add(fundo);

   const aneis = [];
   for (let i = 0; i < 3; i++) {
      const anel = new THREE.Mesh(new THREE.TorusGeometry(2.4 - i * 0.6, 0.06, 8, 48), matAnel);
      anel.rotation.x = Math.PI / 2;
      anel.position.y = yFundo + 0.3 + i * 0.45;
      grupo.add(anel);
      aneis.push(anel);
   }

   const luzPortal = new THREE.PointLight("rgb(150,110,255)", 0, 14 * ESCALA, 1.5);
   luzPortal.position.set(0, -0.6, 0);
   grupo.add(luzPortal);

   // ----------------------------------------------------------------------------
   // ESCOTILHA: duas folhas semicirculares com dobradiças nas bordas
   // Cada folha gira em torno da sua dobradiça (eixo Z) até ficar em pé.
   // ----------------------------------------------------------------------------
   const r = ESCOTILHA.raio - 0.02, espFolha = 0.2;
   const folhas = [];
   for (const lado of [-1, 1]) {
      const pivo = new THREE.Group();
      pivo.position.set(lado * r, 0, 0);
      grupo.add(pivo);

      // CylinderGeometry com thetaLength = PI gera meio disco. Em three.js o
      // ângulo é medido de +Z para +X, então [0,PI] é o lado +X e [PI,2PI] o -X.

      const meioDisco = new THREE.CylinderGeometry(r, r, espFolha, 32, 1, false,
                                                   lado < 0 ? Math.PI : 0, Math.PI);
      const folha = new THREE.Mesh(meioDisco, matMadeira);
      folha.position.set(-lado * r, espFolha / 2 - 0.08, 0); // centro do disco no centro da escotilha
      pivo.add(folha);

      // Duas cintas de ferro sobre a folha 
      // Posições relativas ao centro do disco: a folha ocupa o lado 'lado' em X.

      for (const z of [-1.1, 1.1]) {
         const comp = Math.sqrt(r * r - z * z) - 0.15;
         const cinta = new THREE.Mesh(new THREE.BoxGeometry(comp, 0.06, 0.3), matFerro);
         cinta.position.set(lado * (comp / 2 + 0.05), espFolha / 2 + 0.01, z);
         folha.add(cinta);
      }

      // Argola perto do diâmetro (por onde a folha seria puxada)

      const argola = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.04, 6, 16), matFerro);
      argola.rotation.x = Math.PI / 2;
      argola.position.set(lado * 0.45, espFolha / 2 + 0.03, 0);
      folha.add(argola);

      folhas.push({ pivo, lado });
   }

   // Com o portal aberto, um cilindro invisível impede o jogador de andar sobre o poço

   const bloqueio = new THREE.Mesh(new THREE.CylinderGeometry(ARO.raioExt, ARO.raioExt, 3, 16));
   bloqueio.position.y = 1.5;
   bloqueio.visible = false;
   grupo.add(bloqueio);
   grupo.updateMatrixWorld(true);

   // ----------------------------------------------------------------------------
   // pedestais base, coluna octogonal e taça para a chave
   // ----------------------------------------------------------------------------

   const pedestais = [];
   for (let i = 0; i < 4; i++) {

      const ang = Math.PI / 4 + i * Math.PI / 2;
      const px = Math.cos(ang) * PEDESTAL.distancia, pz = Math.sin(ang) * PEDESTAL.distancia;

      const ped = new THREE.Group();
      ped.position.set(px, PRACA.altura, pz);
      grupo.add(ped);

      const base = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.2, 1.1), matPedraEs);
      base.position.y = 0.1;
      const coluna = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.34, 0.6, 8), matPedra);
      coluna.position.y = 0.2 + 0.3;
      const capitel = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.15, 0.8), matPedraEs);
      capitel.position.y = 0.8 + 0.075;
      const taca = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.18, 0.15, 16), matFerro);
      taca.position.y = 0.95 + 0.075;
      ped.add(base, coluna, capitel, taca);

      // Colisor do pedestal  usando cilindro do tamanho da base

      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, PEDESTAL.altura, 8));
      col.position.y = PEDESTAL.altura / 2;
      col.visible = false;
      ped.add(col);
      grupo.updateMatrixWorld(true);
      collision.addCylinder(col, 0.55 * ESCALA);

      // Luz pontual da chave: criada desde o início com intensidade 0 para que não mude
      // a quantidade de luzes da cena 

      const luz = new THREE.PointLight("rgb(255,200,90)", 0, 9 * ESCALA, 1.6);
      luz.position.y = PEDESTAL.altura + RAIO_CHAVE + 0.5;
      ped.add(luz);

      // Ponto (mundo) onde a chave fica apoiada
      const topo = new THREE.Vector3(0, PEDESTAL.altura + RAIO_CHAVE, 0);
      ped.localToWorld(topo);

      pedestais.push({ grupo: ped, luz, topo, chave: null, tempo: 0 });
   }

   // ----------------------------------------------------------------------------
   // ESTADO E ANIMAÇÃO
   // ----------------------------------------------------------------------------

   let aberto = false;   // o portal já foi liberado (4 chaves)?
   let t = 0;            // progresso da abertura [0,1]
   let tempo = 0;

   collision.addCylinder(bloqueio, ARO.raioExt * ESCALA, { isActive: () => aberto });

   const centroMundo = new THREE.Vector3(ESCOTILHA.x * ESCALA, 0, ESCOTILHA.z * ESCALA);

   return {
      pedestais,
      raioChave: RAIO_CHAVE * ESCALA,
      centro: centroMundo,
      get aberto() { return aberto; },
      get chavesPosicionadas() { return pedestais.filter(p => p.chave !== null).length; },

      /**
       * Coloca uma chave sobre o pedestal 'i'.
       * A chave sobe um pouco ao ser posicionada e a luz acende gradualmente.
       */

      colocarChave(i, malha) {
         const p = pedestais[i];
         p.chave = malha;
         p.tempo = 0;
         malha.position.copy(p.topo);
         scene.add(malha);
         if (pedestais.every(q => q.chave !== null)) aberto = true;
      },

      update(delta) {
         tempo += delta;

         // Chaves nos pedestais: animação de encaixe + luz acendendo

         for (const p of pedestais) {
            if (!p.chave) continue;
            p.tempo += delta;
            const s = Math.min(1, p.tempo / 0.8);
            p.luz.intensity = 6 * s;
            p.chave.position.y = p.topo.y + (1 - s) * 0.8 + Math.sin(tempo * 2 + p.topo.x) * 0.04;
            p.chave.rotation.y += delta * 1.5;
         }

         // Abertura da escotilha

         if (aberto && t < 1) t = Math.min(1, t + delta * 0.45);
         const s = t * t * (3 - 2 * t);
         for (const f of folhas) f.pivo.rotation.z = -f.lado * s * THREE.MathUtils.degToRad(105);

         // Portal

         const pulso = 0.75 + 0.25 * Math.sin(tempo * 3);
         matPortal.emissive.setRGB(0.12 + 0.55 * s * pulso, 0.04 + 0.25 * s * pulso, 0.24 + 0.75 * s * pulso);
         matAnel.emissive.setRGB(0.08 + 0.4 * s, 0.16 + 0.6 * s, 0.27 + 0.73 * s);
         luzPortal.intensity = 30 * s * pulso;
         for (let i = 0; i < aneis.length; i++) {
            aneis[i].rotation.z += delta * (0.6 + i * 0.5) * (i % 2 ? -1 : 1) * (0.3 + s);
            aneis[i].position.y = yFundo + 0.3 + i * 0.45 + s * Math.sin(tempo * 1.5 + i) * 0.15;
         }
      }
   };
}
