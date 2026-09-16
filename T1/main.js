/**
 * =====================================================================================
 *  T1 - First-Person Action-Adventure  |  Castelo de Bodiam
 *  Computação Gráfica - Prof. Rodrigo L. S. Silva
 * =====================================================================================
 *  ARQUIVO PRINCIPAL (orquestrador)
 *
 *  Este arquivo apenas monta a cena e conecta os três módulos do trabalho:
 *
 *    environment.js    -> MODELAGEM DO AMBIENTE  (castelo, escadas, portas animadas)
 *    collision.js      -> SISTEMA DE COLISÃO     (deslize, escadas, quedas suaves)
 *    cameraShooting.js -> CONTROLE DE CÂMERA + SISTEMA DE DISPAROS
 *
 *  Conforme pedido no enunciado, os materiais dos blocos usam setDefaultMaterial(cor)
 *  e a iluminação usa initDefaultBasicLight(scene), ambos de libs/util/util.js.
 * =====================================================================================
 */

import * as THREE from 'three';
import { initRenderer,
         initDefaultBasicLight,
         createGroundPlaneXZ,
         onWindowResize,
         InfoBox,
         SecondaryBox } from "../libs/util/util.js";

import { CollisionSystem } from './collision.js';
import { createCastle, ESCALA } from './environment.js';
import { CameraController, ShootingSystem } from './cameraShooting.js';

// -------------------------------------------------------------------------------------
// 1) CENA, RENDERIZADOR E ILUMINAÇÃO
// -------------------------------------------------------------------------------------
const scene    = new THREE.Scene();
const renderer = initRenderer("rgb(132,178,226)");   // cor do céu
initDefaultBasicLight(scene);                        // iluminação padrão do enunciado

// -------------------------------------------------------------------------------------
// 2) PLANO DE CHÃO
//    Plano grande sobre o qual o castelo é construído. O sistema de colisão trata o
//    chão como um plano infinito em y = 0 (ver CollisionSystem.groundY).
// -------------------------------------------------------------------------------------
const chao = createGroundPlaneXZ(600, 600, 40, 40, "rgb(104,132,80)");
scene.add(chao);

// -------------------------------------------------------------------------------------
// 3) SISTEMA DE COLISÃO E MODELAGEM DO AMBIENTE
//    O castelo registra automaticamente todos os seus volumes de colisão.
// -------------------------------------------------------------------------------------
const collision = new CollisionSystem(0.0);
const castelo   = createCastle(scene, collision);

// -------------------------------------------------------------------------------------
// 4) JOGADOR: CÂMERA EM PRIMEIRA PESSOA E SISTEMA DE DISPAROS
//    O jogador nasce em frente à portaria, de costas para o campo, olhando o castelo.
// -------------------------------------------------------------------------------------
// A distância até a portaria (-72, -49) foi calibrada para o castelo em
// tamanho original: escalamos junto com ESCALA para continuar em frente à
// entrada mesmo que o castelo fique maior/menor.
const spawn      = new THREE.Vector3(0, 0, -72 * ESCALA);
const cameraCtrl = new CameraController(scene, renderer, collision, spawn);
const disparos   = new ShootingSystem(scene, cameraCtrl, collision);

// Olha inicialmente para a entrada do castelo
cameraCtrl.fpCamera.lookAt(0, 6 * ESCALA, -49 * ESCALA);

// -------------------------------------------------------------------------------------
// 5) INTERFACE
// -------------------------------------------------------------------------------------
const info = new InfoBox();
   info.add("T1 - Castelo de Bodiam (FPAA)");
   info.addParagraph();
   info.add("Movimentação: W A S D ou setas");
   info.add("Olhar: mouse");
   info.add("Disparo: botão esquerdo ou direito do mouse");
   info.add("Câmera orbital: tecla C");
   info.addParagraph();
   /* info.add("Suba a escada do pátio até a muralha sul");
   info.add("e caminhe pela borda interna para testar a queda."); */
   info.show();

const status = new SecondaryBox("");
status.changeStyle("rgba(0,0,0,0.35)", "white", "18px");

// -------------------------------------------------------------------------------------
// 6) REDIMENSIONAMENTO DA JANELA (as duas câmeras precisam ser corrigidas)
// -------------------------------------------------------------------------------------
window.addEventListener('resize', function () {
   onWindowResize(cameraCtrl.camera, renderer); // ajusta o renderer e a câmera ativa
   cameraCtrl.onResize();                       // garante a outra câmera também
}, false);

// -------------------------------------------------------------------------------------
// 7) LAÇO PRINCIPAL
// -------------------------------------------------------------------------------------
const clock = new THREE.Clock();

render();
function render() {
   // Limita o delta para que uma pausa longa (troca de aba) não teleporte o jogador
   const delta = Math.min(clock.getDelta(), 0.05);

   collision.refreshDynamic();                             // caixas das portas em movimento
   castelo.update(delta, cameraCtrl.actor.position);       // animação das portas
   cameraCtrl.update(delta);                               // câmera + movimentação
   disparos.update(delta);                                 // projéteis

   // A arma só aparece na visão em primeira pessoa
   disparos.setVisivel(!cameraCtrl.modoOrbital);

   status.changeMessage(
      (cameraCtrl.modoOrbital ? "Câmera orbital (C volta para 1ª pessoa)"
                              : "Primeira pessoa (C inspeciona o ambiente)") +
      "  |  projéteis ativos: " + disparos.quantidade
   );

   renderer.render(scene, cameraCtrl.camera);
   requestAnimationFrame(render);
}
