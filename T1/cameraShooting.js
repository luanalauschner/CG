/**
 * =====================================================================================
 *  T2 - CONTROLE DE CÂMERA + ARMA (BESTA) E DARDOS
 * =====================================================================================
 *  Este módulo concentra duas responsabilidades:
 *
 *  A) CameraController
 *     - Câmera em primeira pessoa usando PointerLockControls (mouse = "look at");
 *     - Movimentação WASD + setas direcionais, sempre passando pelo sistema de
 *       colisão (nada aqui move a câmera "na força bruta");
 *     - SHIFT: corrida. A velocidade não muda de uma vez: ela é acelerada/freada
 *       suavemente e o campo de visão abre um pouco, dando sensação de velocidade;
 *     - ESPAÇO: pulo, com "coyote time" (ainda dá para pular logo após sair de uma
 *       borda) e "buffer" (o pulo apertado um pouco antes de tocar o chão vale);
 *       há um leve "afundar" da câmera ao aterrissar;
 *     - Altura da câmera SUAVIZADA em relação à altura física dos pés: é isso que
 *       elimina os sobressaltos ao subir escadas (durante o pulo ela segue direto);
 *     - Câmera orbital (OrbitControls) ligada/desligada com a tecla 'c'.
 *
 *  B) ShootingSystem
 *     - BESTA medieval modelada em three.js (coronha, arco/prod, corda, estribo,
 *       gatilho), presa à câmera na parte inferior da tela;
 *     - DARDO (virote) visível sobre a besta antes do disparo; ao disparar, a corda
 *       fica solta e um novo dardo só aparece depois do TEMPO DE RECARGA;
 *     - Dardos em voo seguem a trajetória (leve queda) sempre apontados na direção
 *       do movimento; ao atingir o cenário ficam CRAVADOS por alguns segundos; ao
 *       atingir um inimigo causam dano.
 * =====================================================================================
 */

import * as THREE from 'three';
import { PointerLockControls } from '../build/jsm/controls/PointerLockControls.js';
import { OrbitControls } from '../build/jsm/controls/OrbitControls.js';
import { createActor, STEP_HEIGHT } from './collision.js';
import { ESCALA } from './environment.js';

// -------------------------------------------------------------------------------------
// Parâmetros do personagem
// -------------------------------------------------------------------------------------
export const RAIO_JOGADOR   = 0.5;   // raio do cilindro de colisão
export const ALTURA_JOGADOR = 2.1;   // altura total do personagem (T1: 1.8)
const ALTURA_OLHOS   = 1.95;  // altura da câmera em relação aos pés (T1: 1.65)
const VELOCIDADE     = 11.0;  // velocidade de caminhada (unidades/s)
const FATOR_CORRIDA  = 1.75;  // multiplicador da velocidade com SHIFT
const ACELERACAO     = 10.0;  // rapidez com que a velocidade atinge o alvo (no chão)
const ACEL_NO_AR     = 2.5;   // controle reduzido no ar
const VEL_PULO       = 7.6;   // velocidade vertical inicial do pulo (altura ~1,1 unid.)
const COYOTE         = 0.12;  // s após sair do chão em que o pulo ainda vale
const BUFFER_PULO    = 0.15;  // s antes de tocar o chão em que o pulo é "lembrado"
const FOV_BASE       = 60;
const FOV_CORRIDA    = 68;
// Atraso máximo permitido entre a altura da câmera e a altura real dos pés.
const ATRASO_MAX_Y   = 2.0 * STEP_HEIGHT;

// =====================================================================================
// A) CONTROLE DE CÂMERA
// =====================================================================================
export class CameraController {
   /**
    * @param {THREE.Scene} scene
    * @param {THREE.WebGLRenderer} renderer
    * @param {CollisionSystem} collision
    * @param {THREE.Vector3} spawn posição inicial dos pés do jogador
    */
   constructor(scene, renderer, collision, spawn) {
      this.collision = collision;
      this.renderer  = renderer;
      this.spawn     = spawn.clone();

      // --- Câmera em primeira pessoa -------------------------------------------
      this.fpCamera = new THREE.PerspectiveCamera(FOV_BASE, window.innerWidth / window.innerHeight, 0.05, 2000);
      this.fpCamera.position.set(spawn.x, spawn.y + ALTURA_OLHOS, spawn.z);
      scene.add(this.fpCamera); // precisa estar na cena para a arma (filha) ser desenhada

      // --- Câmera orbital, usada para inspecionar o ambiente (tecla 'c') --------
      this.orbitCamera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 3000);
      this.orbitCamera.position.set(0, 45 * ESCALA, -300 * ESCALA);
      this.orbitCamera.lookAt(0, 8 * ESCALA, 0);

      this.orbit = new OrbitControls(this.orbitCamera, renderer.domElement);
      this.orbit.target.set(0, 8 * ESCALA, 0);
      this.orbit.enabled = false; // só liga no modo orbital
      this.orbit.update();

      // --- Ator do sistema de colisão ------------------------------------------
      this.actor = createActor(spawn, RAIO_JOGADOR, ALTURA_JOGADOR);
      this.alturaSuave = spawn.y; // altura interpolada usada pela câmera

      // --- Estado da movimentação ----------------------------------------------
      this.velH          = new THREE.Vector3(); // velocidade horizontal atual
      this.tempoNoAr     = 0;     // tempo desde que saiu do chão (coyote time)
      this.pedidoPulo    = 0;     // tempo restante do "buffer" do pulo
      this.pulando       = false; // true do pulo até tocar o chão de novo
      this.afundar       = 0;     // deslocamento da câmera ao aterrissar
      this.faseBalanco   = 0;     // fase do balanço da cabeça ao andar
      this.balanco       = 0;     // valor atual do balanço (usado também pela arma)
      this.correndo      = false;

      // --- PointerLockControls (olhar com o mouse) ------------------------------
      this.controls = new PointerLockControls(this.fpCamera, renderer.domElement);

      this.modoOrbital = false;

      // --- Estado do teclado ----------------------------------------------------
      this.teclas = { frente: false, tras: false, esquerda: false, direita: false, correr: false };

      // --- Elementos de interface ----------------------------------------------
      this.crosshair = document.getElementById('crosshair');

      this._registrarEventos();
      this._atualizarInterface();
   }

   /** Câmera que deve ser usada no render() a cada quadro. */
   get camera() {
      return this.modoOrbital ? this.orbitCamera : this.fpCamera;
   }

   /** True quando o mouse está capturado (olhar com o mouse e disparar). */
   get ativo() {
      return !this.modoOrbital && this.controls.isLocked;
   }

   // ---------------------------------------------------------------------------
   // EVENTOS
   // ---------------------------------------------------------------------------
   _registrarEventos() {
      // O jogo começa direto (sem painel). O navegador só permite capturar o
      // mouse depois de um clique do usuário, então o primeiro clique em
      // qualquer ponto da tela captura o mouse (esse clique não dispara a besta,
      // ver ShootingSystem). Depois de um ESC, basta clicar de novo.
      document.addEventListener('mousedown', () => {
         if (!this.modoOrbital && !this.controls.isLocked) this.controls.lock();
      });

      this.controls.addEventListener('lock',   () => this._atualizarInterface());
      this.controls.addEventListener('unlock', () => this._atualizarInterface());

      window.addEventListener('keydown', (e) => this._tecla(e, true));
      window.addEventListener('keyup',   (e) => this._tecla(e, false));
   }

   /**
    * Mapeamento de teclas:
    *   W / seta cima     -> frente
    *   S / seta baixo    -> ré
    *   A / seta esquerda -> straif esquerdo
    *   D / seta direita  -> straif direito
    *   SHIFT             -> correr (enquanto pressionado)
    *   ESPAÇO            -> pular
    *   C                 -> alterna câmera orbital
    */
   _tecla(event, pressionada) {
      // As setas e o espaço rolariam a página; aqui eles são comandos do jogo
      if (event.code.startsWith('Arrow') || event.code === 'Space') event.preventDefault();

      switch (event.code) {
         case 'KeyW': case 'ArrowUp':    this.teclas.frente   = pressionada; break;
         case 'KeyS': case 'ArrowDown':  this.teclas.tras     = pressionada; break;
         case 'KeyA': case 'ArrowLeft':  this.teclas.esquerda = pressionada; break;
         case 'KeyD': case 'ArrowRight': this.teclas.direita  = pressionada; break;
         case 'ShiftLeft': case 'ShiftRight': this.teclas.correr = pressionada; break;
         case 'Space':
            if (pressionada && !event.repeat && !this.modoOrbital) this.pedidoPulo = BUFFER_PULO;
            break;
         case 'KeyC':
            // Só alterna na descida da tecla (event.repeat evita repetição automática)
            if (pressionada && !event.repeat) this.alternarCameraOrbital();
            break;
      }
   }

   /**
    * Liga/desliga a câmera orbital.
    * A câmera em primeira pessoa NÃO é movida durante a inspeção: o modo orbital
    * usa uma segunda câmera. Ao voltar, o jogo continua no mesmo ponto.
    */
   alternarCameraOrbital() {
      this.modoOrbital = !this.modoOrbital;

      if (this.modoOrbital) {
         // Zera o teclado para o personagem não "andar sozinho" ao voltar
         this.teclas.frente = this.teclas.tras = false;
         this.teclas.esquerda = this.teclas.direita = this.teclas.correr = false;
         this.velH.set(0, 0, 0);

         this.controls.unlock();      // libera o mouse para o OrbitControls
         this.orbit.enabled = true;
      } else {
         this.orbit.enabled = false;
         // Tenta recapturar o mouse; se o navegador recusar (ele exige um
         // intervalo mínimo entre sair e voltar), o próximo clique captura.
         this.controls.lock();
      }
      this._atualizarInterface();
   }

   /** A mira aparece sempre que a visão está em primeira pessoa. */
   _atualizarInterface() {
      this.crosshair.style.display = this.modoOrbital ? 'none' : 'block';
   }

   // ---------------------------------------------------------------------------
   // ATUALIZAÇÃO POR QUADRO
   // ---------------------------------------------------------------------------
   update(delta) {
      if (this.modoOrbital) {
         this.orbit.update();
         return;
      }

      const estavaNoChao = this.actor.onGround;
      const vyAntes = this.actor.velocityY;

      // O teclado funciona desde o início, mesmo antes de o mouse ser capturado
      this._mover(delta, true);

      // Caiu na água (não deveria acontecer por causa das barreiras): volta ao início
      if (this.actor.position.y < this.collision.groundY + 0.3) this.renascer();

      // --- Aterrissagem: leve "afundar" proporcional à velocidade de queda -------
      if (this.actor.onGround && !estavaNoChao && vyAntes < -6) {
         this.afundar = Math.min(0.35, -vyAntes * 0.02);
      }
      if (this.actor.onGround) this.pulando = false;
      this.afundar = Math.max(0, this.afundar - delta * 1.6);

      // --- Altura da câmera ----------------------------------------------------
      // Subindo/descendo degraus, a altura física dá pequenos saltos que a
      // interpolação transforma em um movimento contínuo. Durante o pulo a
      // câmera acompanha a altura real (senão o pulo pareceria "atrasado").
      const alvoY = this.actor.position.y;
      if (this.pulando) {
         this.alturaSuave = alvoY;
      } else {
         this.alturaSuave = THREE.MathUtils.lerp(this.alturaSuave, alvoY, Math.min(1, 10.0 * delta));
         this.alturaSuave = THREE.MathUtils.clamp(this.alturaSuave,
                                                  alvoY - ATRASO_MAX_Y, alvoY + ATRASO_MAX_Y);
      }

      // --- Balanço da cabeça (mais forte correndo) -------------------------------
      const rapidez = this.velH.length() / VELOCIDADE;
      if (this.actor.onGround && rapidez > 0.1) {
         this.faseBalanco += delta * (this.correndo ? 13 : 9) * Math.min(rapidez, 1.8);
      }
      const ampl = this.actor.onGround ? Math.min(rapidez, 1.8) * 0.035 : 0;
      this.balanco = THREE.MathUtils.lerp(this.balanco, Math.sin(this.faseBalanco) * ampl,
                                          Math.min(1, 12 * delta));

      this.fpCamera.position.set(this.actor.position.x,
                                 this.alturaSuave + ALTURA_OLHOS - this.afundar +
                                    Math.abs(this.balanco) * 0.8,
                                 this.actor.position.z);

      // --- FOV abre um pouco durante a corrida ---------------------------------
      const fovAlvo = (this.correndo && rapidez > 1.1) ? FOV_CORRIDA : FOV_BASE;
      if (Math.abs(this.fpCamera.fov - fovAlvo) > 0.01) {
         this.fpCamera.fov = THREE.MathUtils.lerp(this.fpCamera.fov, fovAlvo, Math.min(1, 6 * delta));
         this.fpCamera.updateProjectionMatrix();
      }
   }

   /** Calcula o deslocamento desejado e entrega ao sistema de colisão. */
   _mover(delta, comControle) {
      // Direção para onde a câmera olha, projetada no plano XZ
      const frente = new THREE.Vector3();
      this.fpCamera.getWorldDirection(frente);
      frente.y = 0;
      if (frente.lengthSq() < 1e-8) frente.set(0, 0, -1);
      frente.normalize();

      // Vetor "direita" = frente x up (straif)
      const direita = new THREE.Vector3().crossVectors(frente, this.fpCamera.up).normalize();

      let eixoFrente = 0, eixoLado = 0;
      if (comControle) {
         if (this.teclas.frente)   eixoFrente += 1;
         if (this.teclas.tras)     eixoFrente -= 1;
         if (this.teclas.direita)  eixoLado   += 1;
         if (this.teclas.esquerda) eixoLado   -= 1;
      }

      const desejada = new THREE.Vector3();
      desejada.addScaledVector(frente,  eixoFrente);
      desejada.addScaledVector(direita, eixoLado);

      // Aumento da velocidade independente da direção e sentido para qual o player está andando
      this.correndo = comControle && this.teclas.correr; //&& eixoFrente > 0;
      const vMax = VELOCIDADE * (this.correndo ? FATOR_CORRIDA : 1);

      // Normaliza para que andar na diagonal não seja mais rápido
      if (desejada.lengthSq() > 1e-8) desejada.normalize().multiplyScalar(vMax);

      // Aceleração suave (exponencial, independente da taxa de quadros). No ar
      // o controle é menor: o pulo conserva o impulso de quem estava correndo.
      const acel = this.actor.onGround ? ACELERACAO : ACEL_NO_AR;
      this.velH.lerp(desejada, 1 - Math.exp(-acel * delta));

      // --- Pulo -------------------------------------------------------------------
      this.tempoNoAr = this.actor.onGround ? 0 : this.tempoNoAr + delta;
      this.pedidoPulo = Math.max(0, this.pedidoPulo - delta);
      if (this.pedidoPulo > 0 && this.tempoNoAr < COYOTE && !this.pulando) {
         this.actor.velocityY = VEL_PULO;
         this.actor.onGround  = false;
         this.pulando   = true;
         this.pedidoPulo = 0;
         this.tempoNoAr  = COYOTE; // impede um segundo pulo no ar
      }

      // Toda a movimentação passa pelo sistema de colisão (deslize, degraus, queda)
      const antes = this.actor.position.clone();
      this.collision.moveActor(this.actor, this.velH.x * delta, this.velH.z * delta, delta);

      // Se uma parede barrou o movimento, a velocidade acompanha (evita "grudar")
      if (delta > 0) {
         const realX = (this.actor.position.x - antes.x) / delta;
         const realZ = (this.actor.position.z - antes.z) / delta;
         if (Math.abs(realX) < Math.abs(this.velH.x)) this.velH.x = realX;
         if (Math.abs(realZ) < Math.abs(this.velH.z)) this.velH.z = realZ;
      }
   }

   /** Volta o jogador ao ponto inicial. */
   renascer() {
      this.actor.position.copy(this.spawn);
      this.actor.velocityY = 0;
      this.velH.set(0, 0, 0);
      this.alturaSuave = this.spawn.y;
   }

   /** Ajusta as duas câmeras quando a janela muda de tamanho. */
   onResize() {
      const aspect = window.innerWidth / window.innerHeight;
      this.fpCamera.aspect = aspect;
      this.fpCamera.updateProjectionMatrix();
      this.orbitCamera.aspect = aspect;
      this.orbitCamera.updateProjectionMatrix();
   }
}

// =====================================================================================
// B) BESTA + DARDOS
// =====================================================================================

const DARDO = {
   comprimento: 0.62,
   velocidade:  75.0,   // unidades/s
   gravidade:   3.5,    // queda leve (o dardo é pesado e rápido)
   alcance:     320.0,  // distância máxima
   passoMax:    0.4,    // maior avanço por sub-passo (teste de colisão)
   tempoCravado: 8.0,   // s que o dardo fica preso na parede
   maxCravados: 30
};
const RECARGA = 0.9; // tempo (s) entre um disparo e o próximo

// Materiais (Lambert) da besta e dos dardos
const MAT = {
   madeira:     new THREE.MeshLambertMaterial({ color: "rgb(120,74,40)" }),
   madeiraClara:new THREE.MeshLambertMaterial({ color: "rgb(170,120,70)" }),
   ferro:       new THREE.MeshLambertMaterial({ color: "rgb(78,80,88)" }),
   aco:         new THREE.MeshLambertMaterial({ color: "rgb(165,170,180)" }),
   corda:       new THREE.MeshLambertMaterial({ color: "rgb(225,212,180)" }),
   haste:       new THREE.MeshLambertMaterial({ color: "rgb(196,160,108)" }),
   pena:        new THREE.MeshLambertMaterial({ color: "rgb(170,30,30)", side: THREE.DoubleSide }),
   penaClara:   new THREE.MeshLambertMaterial({ color: "rgb(235,230,220)", side: THREE.DoubleSide })
};

/** Cilindro fino ligando dois pontos (cordas, tirantes). */
function cilindroEntre(a, b, raio, material) {
   const dir = new THREE.Vector3().subVectors(b, a);
   const m = new THREE.Mesh(new THREE.CylinderGeometry(raio, raio, dir.length(), 6), material);
   m.position.copy(a).addScaledVector(dir, 0.5);
   m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
   return m;
}

/**
 * Cria um DARDO de besta (virote) apontando para -Z (ponta em z = -0.1):
 *   - ponta de aço em forma de pirâmide de 4 faces (ponta "bodkin", perfurante);
 *   - haste de madeira, um pouco mais grossa que a de uma flecha comum;
 *   - três empenas (aletas) triangulares, a 120° umas das outras, na traseira;
 *   - anel de reforço (atadura) entre haste e empenas.
 */
function criarDardo() {
   const L = DARDO.comprimento;
   const dardo = new THREE.Group();

   const ponta = new THREE.Mesh(new THREE.ConeGeometry(0.022, 0.1, 4), MAT.aco);
   ponta.rotation.x = -Math.PI / 2;          // cone aponta para -Z
   ponta.position.z = -0.05;
   dardo.add(ponta);

   const encaixe = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.015, 0.04, 8), MAT.ferro);
   encaixe.rotation.x = Math.PI / 2;
   encaixe.position.z = 0.015;
   dardo.add(encaixe);

   const haste = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, L - 0.1, 8), MAT.haste);
   haste.rotation.x = Math.PI / 2;
   haste.position.z = 0.1 + (L - 0.1) / 2 - 0.1;
   dardo.add(haste);

   const atadura = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.03, 8), MAT.corda);
   atadura.rotation.x = Math.PI / 2;
   atadura.position.z = L - 0.2;
   dardo.add(atadura);

   // Empena: triângulo retângulo (perfil de "vela") no plano YZ
   const perfil = new THREE.Shape();
   perfil.moveTo(0, 0);
   perfil.lineTo(0.17, 0);
   perfil.lineTo(0.15, 0.045);
   perfil.lineTo(0.03, 0.045);
   perfil.closePath();
   const geoEmpena = new THREE.ShapeGeometry(perfil);
   for (let i = 0; i < 3; i++) {
      const suporte = new THREE.Group();
      suporte.rotation.z = i * (2 * Math.PI / 3);
      const empena = new THREE.Mesh(geoEmpena, i === 0 ? MAT.pena : MAT.penaClara);
      // Shape no plano XY: gira para o comprimento ficar ao longo de +Z
      empena.rotation.y = -Math.PI / 2;
      empena.position.set(0, 0.009, L - 0.27);
      suporte.add(empena);
      dardo.add(suporte);
   }

   const nock = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.011, 0.03, 8), MAT.ferro);
   nock.rotation.x = Math.PI / 2;
   nock.position.z = L - 0.1 + 0.005;
   dardo.add(nock);

   return dardo;
}

export class ShootingSystem {

   /**
    * @param {THREE.Scene} scene
    * @param {CameraController} cameraCtrl
    * @param {CollisionSystem} collision
    * @param {SistemaDeInimigos} inimigos alvos que podem receber dano
    */
   constructor(scene, cameraCtrl, collision, inimigos) {
      this.scene      = scene;
      this.cameraCtrl = cameraCtrl;
      this.collision  = collision;
      this.inimigos   = inimigos;

      this.dardos   = [];   // em voo ou cravados
      this.recarga  = RECARGA; // tempo desde o último disparo
      this.recuo    = 0;       // animação de recuo da besta
      this.deslocamentoParede = 0;

      this.barraRecarga = document.querySelector('#recarga .valor');

      this._criarBesta();
      this._registrarEventos();
   }

   /**
    * Modela a besta (frente para -Z), presa à câmera, centralizada na parte
    * inferior da tela.
    */
   _criarBesta() {
      const besta = new THREE.Group();

      // --- Coronha (stock) e trilho -------------------------------------------
      const coronha = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.07, 0.95), MAT.madeira);
      coronha.position.set(0, -0.035, -0.08);
      besta.add(coronha);

      // Culatra mais larga, inclinada para baixo, que apoia no ombro
      const culatra = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.14, 0.3), MAT.madeira);
      culatra.position.set(0, -0.09, 0.42);
      culatra.rotation.x = 0.18;
      besta.add(culatra);

      // Trilho (sulco) onde o dardo se apoia
      for (const lado of [-1, 1]) {
         const borda = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.014, 0.8), MAT.madeiraClara);
         borda.position.set(lado * 0.022, 0.006, -0.15);
         besta.add(borda);
      }

      // --- Arco (prod) de aço: tubo ao longo de uma curva --------------------------
      const curvaArco = new THREE.CatmullRomCurve3([
         new THREE.Vector3(-0.46, 0.0, -0.40),
         new THREE.Vector3(-0.25, 0.0, -0.52),
         new THREE.Vector3( 0.00, 0.0, -0.56),
         new THREE.Vector3( 0.25, 0.0, -0.52),
         new THREE.Vector3( 0.46, 0.0, -0.40)
      ]);
      const arco = new THREE.Mesh(new THREE.TubeGeometry(curvaArco, 40, 0.018, 8, false), MAT.aco);
      besta.add(arco);
      // Ponteiras do arco (onde a corda se prende)
      for (const lado of [-1, 1]) {
         const ponteira = new THREE.Mesh(new THREE.SphereGeometry(0.024, 10, 8), MAT.ferro);
         ponteira.position.set(lado * 0.46, 0, -0.40);
         besta.add(ponteira);
      }
      // Cabeça da coronha onde o arco é preso + amarração
      const cabeca = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.09, 0.09), MAT.ferro);
      cabeca.position.set(0, -0.02, -0.55);
      besta.add(cabeca);

      // Colisor na cabeça da coronha para evitar que a BESTA entre em paredes
      this.cabecaColi = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.99, 0.99));
      this.cabecaColi.position.set(0, -0.02, -0.55);
      this.cabecaColi.visible = false;
      besta.add(this.cabecaColi);

      // --- Estribo (para armar com o pé) -------------------------------------------
      const estribo = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.01, 6, 20, Math.PI), MAT.ferro);
      estribo.rotation.set(Math.PI / 2, 0, 0);
      estribo.position.set(0, -0.02, -0.6);
      besta.add(estribo);

      // --- Noz (trava da corda), gatilho e cintas de ferro --------------------------
      const noz = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.06, 12), MAT.aco);
      noz.rotation.z = Math.PI / 2;
      noz.position.set(0, 0.012, 0.12);
      besta.add(noz);

      const gatilho = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.2, 0.025), MAT.ferro);
      gatilho.position.set(0, -0.15, 0.24);
      gatilho.rotation.x = -0.35;
      besta.add(gatilho);

      for (const z of [-0.42, 0.02, 0.3]) {
         const cinta = new THREE.Mesh(new THREE.BoxGeometry(0.082, 0.078, 0.02), MAT.ferro);
         cinta.position.set(0, -0.035, z);
         besta.add(cinta);
      }

      // --- Corda: armada (puxada até a noz) e solta (reta entre as ponteiras) -------
      const pE = new THREE.Vector3(-0.46, 0, -0.40), pD = new THREE.Vector3(0.46, 0, -0.40);
      const pNoz = new THREE.Vector3(0, 0.012, 0.1);
      this.cordaArmada = new THREE.Group();
      this.cordaArmada.add(cilindroEntre(pE, pNoz, 0.005, MAT.corda),
                           cilindroEntre(pD, pNoz, 0.005, MAT.corda));
      this.cordaSolta = cilindroEntre(pE, pD, 0.005, MAT.corda);
      this.cordaSolta.visible = false;
      besta.add(this.cordaArmada, this.cordaSolta);

      // --- Dardo carregado, apoiado no trilho -----------------------------------------
      // Ponta um pouco à frente do arco; traseira encostada na noz
      this.dardoCarregado = criarDardo();
      this.posDardo = new THREE.Vector3(0, 0.024, 0.095 - (DARDO.comprimento - 0.09));
      this.dardoCarregado.position.copy(this.posDardo);
      besta.add(this.dardoCarregado);

      // Posição da besta na tela: centralizada, na parte inferior
      this.posBase = new THREE.Vector3(0, -0.36, -0.62);
      besta.position.copy(this.posBase);
      besta.rotation.x = 0.04;

      // A besta não projeta sombra (ela "flutua" junto à câmera), só recebe
      besta.traverse(o => { if (o.isMesh) { o.receiveShadow = true; o.userData.semSombra = true; } });

      this.arma = besta;
      this.cameraCtrl.fpCamera.add(besta);
   }

   /** Registra os eventos de disparo (qualquer botão do mouse). */
   _registrarEventos() {
      document.addEventListener('mousedown', (event) => {
         if (!this.cameraCtrl.ativo) return;
         if (event.button === 0 || event.button === 2) this.atirar();
      });
      document.addEventListener('contextmenu', (event) => event.preventDefault());
   }

   get pronto() { return this.recarga >= RECARGA; }

   /** Dispara o dardo carregado (se a recarga já terminou). */
   atirar() {
      if (!this.pronto) return;
      this.recarga = 0;
      this.recuo = 1;

      const camera = this.cameraCtrl.fpCamera;
      camera.updateMatrixWorld(true);

      // Posição/orientação de partida = as do dardo que estava na besta
      const origem = new THREE.Vector3();
      this.dardoCarregado.getWorldPosition(origem);

      // Direção: do dardo até o ponto para onde a mira (centro da tela) aponta
      const dirCamera = new THREE.Vector3();
      camera.getWorldDirection(dirCamera);
      const alvo = camera.position.clone().addScaledVector(dirCamera, 60);
      const direcao = alvo.sub(origem).normalize();

      const malha = criarDardo();
      malha.position.copy(origem);
      malha.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), direcao);
      malha.traverse(o => { if (o.isMesh) o.castShadow = true; });
      this.scene.add(malha);

      this.dardos.push({
         malha,
         velocidade: direcao.multiplyScalar(DARDO.velocidade),
         percorrido: 0,
         cravado: false,
         tempo: 0
      });

      // Besta descarregada: some o dardo e a corda fica solta até recarregar
      this.dardoCarregado.visible = false;
      this.cordaArmada.visible = false;
      this.cordaSolta.visible = true;
   }

   _removerDardo(i) {
      this.scene.remove(this.dardos[i].malha);
      this.dardos.splice(i, 1);
   }

   /**
    * Atualiza a recarga, a animação da besta e todos os dardos.
    */
   update(delta) {
      // --- Recarga -----------------------------------------------------------------
      const estavaPronto = this.pronto;
      this.recarga = Math.min(RECARGA, this.recarga + delta);
      const prog = this.recarga / RECARGA;
      if (this.barraRecarga) {
         this.barraRecarga.style.width = (prog * 100).toFixed(0) + '%';
         this.barraRecarga.parentElement.style.opacity = prog < 1 ? '1' : '0';
      }
      // Na segunda metade da recarga a corda é armada e o novo dardo desliza
      // para o trilho, de trás para frente
      if (prog > 0.45) {
         this.cordaArmada.visible = true;
         this.cordaSolta.visible = false;
         this.dardoCarregado.visible = true;
         const s = Math.min(1, (prog - 0.45) / 0.55);
         const suave = s * s * (3 - 2 * s);
         this.dardoCarregado.position.copy(this.posDardo);
         this.dardoCarregado.position.z += (1 - suave) * 0.35;
      }
      if (!estavaPronto && this.pronto) this.dardoCarregado.position.copy(this.posDardo);

      // --- Verificação de colisão da arma contra paredes ---
      const posicaoMundialBesta = new THREE.Vector3();
      this.cabecaColi.getWorldPosition(posicaoMundialBesta);

      const raioTeste = 0.30;
      const hit = this.collision.sphereCollision(posicaoMundialBesta, raioTeste);

      const zAlvoParede = hit ? 0.60 : 0.0;
      const suavizacao = 15.0;

      this.deslocamentoParede = THREE.MathUtils.lerp(this.deslocamentoParede, zAlvoParede, suavizacao * delta);

      // --- Recuo e balanço da besta -----------------------------------------------
      this.recuo = Math.max(0, this.recuo - delta * 5);
      const r = this.recuo * this.recuo;
      const bal = this.cameraCtrl.balanco;
      this.arma.position.set(this.posBase.x + bal * 0.6,
                             this.posBase.y - Math.abs(bal) * 0.5 + r * 0.02,
                             this.posBase.z + r * 0.12 + this.deslocamentoParede);
      this.arma.rotation.x = 0.04 + r * 0.18;

      // --- Dardos -----------------------------------------------------------------
      const ponta = new THREE.Vector3();
      const frente = new THREE.Vector3();
      let cravados = 0;

      for (let i = this.dardos.length - 1; i >= 0; i--) {
         const d = this.dardos[i];
         d.tempo += delta;

         if (d.cravado) {
            cravados++;
            if (d.tempo > DARDO.tempoCravado) this._removerDardo(i);
            continue;
         }

         d.velocidade.y -= DARDO.gravidade * delta;

         const avanco = d.velocidade.length() * delta;
         const nSub = Math.max(1, Math.ceil(avanco / DARDO.passoMax));
         const passo = delta / nSub;
         let remover = false;

         for (let s = 0; s < nSub; s++) {
            d.malha.position.addScaledVector(d.velocidade, passo);
            d.percorrido += d.velocidade.length() * passo;

            // O dardo sempre aponta para onde está indo
            frente.copy(d.velocidade).normalize();
            d.malha.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), frente);
            ponta.copy(d.malha.position).addScaledVector(frente, 0.1); // ponta do dardo

            // 1) Inimigos
            const alvo = this.inimigos ? this.inimigos.testarAcerto(ponta) : null;
            if (alvo) {
               this.inimigos.atingir(alvo);
               remover = true;
               break;
            }

            // 2) Cenário: o dardo fica cravado (um pouco "enterrado" na superfície)
            const colisao = this.collision.sphereCollision(ponta, 0.03);
            if (colisao !== null) {
               if (ponta.y <= this.collision.groundY + 0.05) { remover = true; break; } // afundou na água
               d.malha.position.addScaledVector(frente, 0.06 - colisao.depth);
               d.cravado = true;
               d.tempo = 0;
               break;
            }

            if (d.percorrido >= DARDO.alcance) { remover = true; break; }
         }

         if (remover) this._removerDardo(i);
      }

      // Limita a quantidade de dardos cravados (remove os mais antigos)
      while (cravados > DARDO.maxCravados) {
         const idx = this.dardos.findIndex(d => d.cravado);
         if (idx < 0) break;
         this._removerDardo(idx);
         cravados--;
      }
   }

   /** Quantidade de dardos em voo. */
   get quantidade() {
      return this.dardos.filter(d => !d.cravado).length;
   }

   /** Esconde ou mostra a besta. */
   setVisivel(v) {
      this.arma.visible = v;
   }
}
