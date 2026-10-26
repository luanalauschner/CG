/**
 *  ARQUIVO PRINCIPAL - T2
 *
 *  Conecta os módulos do trabalho:
 *
 *    environment.js    -> AMBIENTE: castelo, ilha, acesso (ponte) e elementos CSG
 *                         (seteiras, pórtico, torres cilíndricas acessíveis)
 *    interior.js       -> INTERIOR DO CASTELO: pedestais, escotilha e portal
 *    lighting.js       -> ILUMINAÇÃO: dia (10h) / noite (18h), sombras
 *    enemies.js        -> INIMIGOS importados (luz pontual + barra de energia)
 *    keys.js           -> CHAVES (coleta, HUD, tecla K, pedestais)
 *    cameraShooting.js -> CÂMERA (corrida, pulo) + BESTA e DARDOS
 *    collision.js      -> SISTEMA DE COLISÃO
 *
 * =====================================================================================
 */

import * as THREE from 'three';
import { initRenderer,
         onWindowResize,
         InfoBox,
         SecondaryBox } from "../libs/util/util.js";

import { CollisionSystem } from './collision.js';
import { createCastle, ESCALA, NIVEL_AGUA } from './environment.js';
import { createInterior } from './interior.js';
import { SistemaDeIluminacao } from './lighting.js';
import { SistemaDeInimigos } from './enemies.js';
import { SistemaDeChaves } from './keys.js';
import { CameraController, ShootingSystem, ALTURA_JOGADOR } from './cameraShooting.js';

// -------------------------------------------------------------------------------------
// 1) CENA, RENDERIZADOR E ILUMINAÇÃO (dia/noite)
// -------------------------------------------------------------------------------------
const scene    = new THREE.Scene();
const renderer = initRenderer("rgb(132,178,226)", THREE.PCFShadowMap);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
const luzes    = new SistemaDeIluminacao(scene, renderer);

// -------------------------------------------------------------------------------------
// 2) SISTEMA DE COLISÃO, AMBIENTE E INTERIOR
//    O "chão infinito" do sistema de colisão agora é o nível da água (plano base);
//    a ilha do castelo e o acesso têm colisores próprios, mais altos que ele.
// -------------------------------------------------------------------------------------
const collision = new CollisionSystem(NIVEL_AGUA * ESCALA);
const castelo   = createCastle(scene, collision);
const interior  = createInterior(scene, collision);

// -------------------------------------------------------------------------------------
// 3) JOGADOR: CÂMERA EM PRIMEIRA PESSOA
//    O jogador nasce na ilha octogonal do acesso, olhando para o castelo.
// -------------------------------------------------------------------------------------
const spawn      = new THREE.Vector3(0, 0, -100 * ESCALA); // centro da ilha octogonal
const cameraCtrl = new CameraController(scene, renderer, collision, spawn);
cameraCtrl.fpCamera.lookAt(0, 8 * ESCALA, -49 * ESCALA);

// -------------------------------------------------------------------------------------
// 4) CHAVES, INIMIGOS E ARMA
// -------------------------------------------------------------------------------------
const chaves   = new SistemaDeChaves(scene, interior);
const inimigos = new SistemaDeInimigos(scene, (posicao) => chaves.soltarChave(posicao));
const besta    = new ShootingSystem(scene, cameraCtrl, collision, inimigos);

// Inimigos só aparecem à noite
luzes.aoMudar((noite) => inimigos.setNoite(noite));

// Tecla 'H': alterna entre dia (10h) e noite (18h)
window.addEventListener('keydown', (e) => {
   if (e.code === 'KeyH' && !e.repeat) luzes.alternar();
});

// -------------------------------------------------------------------------------------
// 5) SOMBRAS EM TODOS OS ELEMENTOS
//    Todos os objetos projetam e recebem sombra, exceto o que está marcado como
//    'semSombra' (a besta presa à câmera), a água (só recebe) e o Sol/Lua.
// -------------------------------------------------------------------------------------
function configurarSombras(raiz) {
   raiz.traverse((o) => {
      if (!o.isMesh) return;
      o.receiveShadow = true;
      o.castShadow = !o.userData.semSombra;
   });
}
configurarSombras(scene);
scene.getObjectByName('agua').castShadow = false;
luzes.astro.castShadow = luzes.astro.receiveShadow = false;

// -------------------------------------------------------------------------------------
// 6) INTERFACE
// -------------------------------------------------------------------------------------
const info = new InfoBox();
   info.add("T2 - Castelo de Bodiam (FPAA)");
   info.addParagraph();
   info.add("Movimentação: W A S D ou setas");
   info.add("Correr: SHIFT   |   Pular: ESPAÇO");
   info.add("Olhar: mouse   |   Disparo: botões do mouse");
   info.add("H: dia / noite (inimigos só à noite)");
   info.add("K: pegar todas as chaves / voltar");
   info.add("C: câmera orbital");
   info.show();

const status = new SecondaryBox("");
status.changeStyle("rgba(0,0,0,0.35)", "white", "18px");

// -------------------------------------------------------------------------------------
// 7) REDIMENSIONAMENTO DA JANELA (as duas câmeras precisam ser corrigidas)
// -------------------------------------------------------------------------------------
window.addEventListener('resize', function () {
   onWindowResize(cameraCtrl.camera, renderer);
   cameraCtrl.onResize();
}, false);

// -------------------------------------------------------------------------------------
// 8) LAÇO PRINCIPAL
// -------------------------------------------------------------------------------------
const clock = new THREE.Clock();
let sombrasInimigosOk = false;

render();
function render() {
   // Limita o delta para que uma pausa longa (troca de aba) não teleporte o jogador
   const delta = Math.min(clock.getDelta(), 0.05);

   // Os modelos dos inimigos chegam de forma assíncrona: configura as sombras
   // deles assim que terminarem de carregar
   if (!sombrasInimigosOk && inimigos.carregado) {
      for (const ini of inimigos.inimigos) configurarSombras(ini.raiz);
      // as barras de energia não projetam sombra
      for (const ini of inimigos.inimigos) ini.barra.traverse(o => { o.castShadow = false; });
      sombrasInimigosOk = true;
   }

   collision.refreshDynamic();                             // caixas das portas em movimento
   castelo.update(delta, cameraCtrl.actor.position);       // animação das portas
   cameraCtrl.update(delta);                               // câmera + movimentação
   inimigos.update(delta, cameraCtrl.camera);              // patrulha, dano, morte
   besta.update(delta);                                    // recarga e dardos
   chaves.update(delta, cameraCtrl.actor.position, ALTURA_JOGADOR);
   interior.update(delta);                                 // pedestais e portal

   // A arma só aparece na visão em primeira pessoa
   besta.setVisivel(!cameraCtrl.modoOrbital);

   status.changeMessage(
      luzes.nomeHorario +
      (luzes.noite ? `  |  inimigos: ${inimigos.vivos}` : "  |  aperte H para a noite") +
      (cameraCtrl.modoOrbital ? "  |  câmera orbital (C volta)" : "") +
      (cameraCtrl.correndo ? "  |  correndo" : "")
   );

   renderer.render(scene, cameraCtrl.camera);
   requestAnimationFrame(render);
}
