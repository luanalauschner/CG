/**
 * =====================================================================================
 *  T1 - CONTROLE DE CÂMERA + SISTEMA DE DISPAROS
 * =====================================================================================
 *  Este módulo concentra duas responsabilidades do enunciado:
 *
 *  A) CameraController
 *     - Câmera em primeira pessoa usando PointerLockControls (mouse = "look at");
 *     - Movimentação WASD + setas direcionais, sempre passando pelo sistema de
 *       colisão (nada aqui move a câmera "na força bruta");
 *     - Altura da câmera SUAVIZADA em relação à altura física dos pés: é isso que
 *       elimina os sobressaltos ao subir escadas;
 *     - Câmera orbital (OrbitControls) ligada/desligada com a tecla 'c'. São duas
 *       câmeras independentes, então a posição/orientação em primeira pessoa fica
 *       naturalmente armazenada enquanto inspecionamos o ambiente;
 *     - Controle da mira (crosshair) e do painel de instruções.
 *
 *  B) ShootingSystem
 *     - Arma representada por um cilindro preso à câmera, centralizado na parte
 *       inferior da tela;
 *     - Projéteis (esferas) que saem da boca do cilindro na direção da mira;
 *     - Cadência de tiro, remoção ao colidir com o cenário e remoção ao ultrapassar
 *       a distância máxima.
 * =====================================================================================
 */

import * as THREE from 'three';
import { PointerLockControls } from '../build/jsm/controls/PointerLockControls.js';
import { OrbitControls } from '../build/jsm/controls/OrbitControls.js';
import { createActor, STEP_HEIGHT } from './collision.js';

// -------------------------------------------------------------------------------------
// Parâmetros do personagem
// -------------------------------------------------------------------------------------
const RAIO_JOGADOR   = 0.5;   // raio do cilindro de colisão
const ALTURA_JOGADOR = 1.8;   // altura total do personagem
const ALTURA_OLHOS   = 1.65;  // altura da câmera em relação aos pés
const VELOCIDADE     = 11.0;  // velocidade de caminhada (unidades/s)
const SUAVIZA_Y      = 14.0;  // constante de suavização da altura da câmera
// Atraso máximo permitido entre a altura da câmera e a altura real dos pés.
// Precisa ser MAIOR que o espelho dos degraus (0,6) para que a subida de escada
// seja totalmente suavizada, e pequeno o bastante para que a câmera não fique
// "flutuando" durante uma queda longa.
const ATRASO_MAX_Y   = 1.2 * STEP_HEIGHT;

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

      // --- Câmera em primeira pessoa -------------------------------------------
      this.fpCamera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 2000);
      this.fpCamera.position.set(spawn.x, spawn.y + ALTURA_OLHOS, spawn.z);
      scene.add(this.fpCamera); // precisa estar na cena para a arma (filha) ser desenhada

      // --- Câmera orbital, usada para inspecionar o ambiente (tecla 'c') --------
      this.orbitCamera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 3000);
      this.orbitCamera.position.set(0, 110, 165);
      this.orbitCamera.lookAt(0, 0, 0);

      this.orbit = new OrbitControls(this.orbitCamera, renderer.domElement);
      this.orbit.target.set(0, 8, 0);
      this.orbit.enabled = false; // só liga no modo orbital
      this.orbit.update();

      // --- Ator do sistema de colisão ------------------------------------------
      this.actor = createActor(spawn, RAIO_JOGADOR, ALTURA_JOGADOR);
      this.alturaSuave = spawn.y; // altura interpolada usada pela câmera

      // --- PointerLockControls (olhar com o mouse) ------------------------------
      this.controls = new PointerLockControls(this.fpCamera, renderer.domElement);

      this.modoOrbital     = false;
      this._aguardandoLock = false; // ver alternarCameraOrbital()

      // --- Estado do teclado ----------------------------------------------------
      this.teclas = { frente: false, tras: false, esquerda: false, direita: false };

      // --- Elementos de interface ----------------------------------------------
      this.blocker      = document.getElementById('blocker');
      this.instructions = document.getElementById('instructions');
      this.crosshair    = document.getElementById('crosshair');

      this._registrarEventos();
      this._atualizarInterface();
   }

   /** Câmera que deve ser usada no render() a cada quadro. */
   get camera() {
      return this.modoOrbital ? this.orbitCamera : this.fpCamera;
   }

   /** True quando o jogador está efetivamente jogando (mouse capturado). */
   get ativo() {
      return !this.modoOrbital && this.controls.isLocked;
   }

   // ---------------------------------------------------------------------------
   // EVENTOS
   // ---------------------------------------------------------------------------
   _registrarEventos() {
      // Clique em qualquer ponto do painel captura o mouse e inicia o jogo
      this.blocker.addEventListener('click', () => {
         if (!this.modoOrbital) this.controls.lock();
      });

      this.controls.addEventListener('lock', () => {
         this._aguardandoLock = false;
         this._atualizarInterface();
      });
      this.controls.addEventListener('unlock', () => this._atualizarInterface());

      window.addEventListener('keydown', (e) => this._tecla(e, true));
      window.addEventListener('keyup',   (e) => this._tecla(e, false));
   }

   /**
    * Mapeamento de teclas exigido no enunciado:
    *   W / seta cima     -> frente
    *   S / seta baixo    -> ré
    *   A / seta esquerda -> straif esquerdo
    *   D / seta direita  -> straif direito
    *   C                 -> alterna câmera orbital
    */
   _tecla(event, pressionada) {
      // As setas rolariam a página; aqui elas são apenas comandos de movimento
      if (event.code.startsWith('Arrow')) event.preventDefault();

      switch (event.code) {
         case 'KeyW': case 'ArrowUp':    this.teclas.frente   = pressionada; break;
         case 'KeyS': case 'ArrowDown':  this.teclas.tras     = pressionada; break;
         case 'KeyA': case 'ArrowLeft':  this.teclas.esquerda = pressionada; break;
         case 'KeyD': case 'ArrowRight': this.teclas.direita  = pressionada; break;
         case 'KeyC':
            // Só alterna na descida da tecla (event.repeat evita repetição automática)
            if (pressionada && !event.repeat) this.alternarCameraOrbital();
            break;
      }
   }

   /**
    * Liga/desliga a câmera orbital.
    *
    * A câmera em primeira pessoa NÃO é movida durante a inspeção: ela permanece
    * exatamente onde estava (mesma posição e mesma orientação), pois o modo
    * orbital usa uma segunda câmera. Ao voltar, o jogo continua no mesmo ponto.
    */
   alternarCameraOrbital() {
      this.modoOrbital = !this.modoOrbital;

      if (this.modoOrbital) {
         // Zera o teclado para o personagem não "andar sozinho" ao voltar
         this.teclas.frente = this.teclas.tras = false;
         this.teclas.esquerda = this.teclas.direita = false;

         this._aguardandoLock = false;
         this.controls.unlock();      // libera o mouse para o OrbitControls
         this.orbit.enabled = true;
      } else {
         this.orbit.enabled = false;
         // A captura do mouse é assíncrona (e o navegador impõe um intervalo
         // mínimo entre sair e voltar a capturar). Enquanto ela não confirma,
         // seguramos o painel de instruções; se falhar, ele aparece e basta clicar.
         this._aguardandoLock = true;
         this.controls.lock();
         setTimeout(() => {
            this._aguardandoLock = false;
            this._atualizarInterface();
         }, 1500);
      }
      this._atualizarInterface();
   }

   /** Mostra/esconde mira e painel de instruções conforme o estado atual. */
   _atualizarInterface() {
      const jogando = this.ativo;
      this.crosshair.style.display = jogando ? 'block' : 'none';

      const mostrarPainel = !this.modoOrbital && !this.controls.isLocked && !this._aguardandoLock;
      this.blocker.style.display      = mostrarPainel ? 'block' : 'none';
      this.instructions.style.display = mostrarPainel ? '' : 'none';
   }

   // ---------------------------------------------------------------------------
   // ATUALIZAÇÃO POR QUADRO
   // ---------------------------------------------------------------------------
   update(delta) {
      if (this.modoOrbital) {
         this.orbit.update();
         return;
      }

      if (this.controls.isLocked) this._mover(delta);

      // Altura da câmera: segue a altura física dos pés de forma AMORTECIDA.
      // - Subindo/descendo degraus, a altura física dá pequenos saltos (0,6
      //   unidades) que a interpolação transforma em um movimento contínuo,
      //   dando a mesma sensação de subir uma rampa;
      // - Na queda, a própria gravidade já produz um movimento contínuo; o
      //   amortecimento apenas suaviza o instante do pouso.
      const alvoY = this.actor.position.y;

      // Interpolação exponencial (resultado independente da taxa de quadros)
      this.alturaSuave += (alvoY - this.alturaSuave) * (1 - Math.exp(-SUAVIZA_Y * delta));

      // Em uma queda longa a velocidade é alta e o amortecimento acumularia um
      // atraso grande demais; aqui limitamos esse atraso.
      this.alturaSuave = THREE.MathUtils.clamp(this.alturaSuave,
                                               alvoY - ATRASO_MAX_Y,
                                               alvoY + ATRASO_MAX_Y);

      this.fpCamera.position.set(this.actor.position.x,
                                 this.alturaSuave + ALTURA_OLHOS,
                                 this.actor.position.z);
   }

   /** Calcula o deslocamento desejado e entrega ao sistema de colisão. */
   _mover(delta) {
      // Direção para onde a câmera olha, projetada no plano XZ
      const frente = new THREE.Vector3();
      this.fpCamera.getWorldDirection(frente);
      frente.y = 0;
      if (frente.lengthSq() < 1e-8) frente.set(0, 0, -1);
      frente.normalize();

      // Vetor "direita" = frente x up (straif)
      const direita = new THREE.Vector3().crossVectors(frente, this.fpCamera.up).normalize();

      let eixoFrente = 0, eixoLado = 0;
      if (this.teclas.frente)   eixoFrente += 1;
      if (this.teclas.tras)     eixoFrente -= 1;
      if (this.teclas.direita)  eixoLado   += 1;
      if (this.teclas.esquerda) eixoLado   -= 1;

      const passo = new THREE.Vector3();
      passo.addScaledVector(frente,  eixoFrente);
      passo.addScaledVector(direita, eixoLado);

      // Normaliza para que andar na diagonal não seja mais rápido
      if (passo.lengthSq() > 1e-8) passo.normalize().multiplyScalar(VELOCIDADE * delta);

      // Toda a movimentação passa pelo sistema de colisão (deslize, degraus, queda)
      this.collision.moveActor(this.actor, passo.x, passo.z, delta);
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
// B) SISTEMA DE DISPAROS
// =====================================================================================

const PROJETIL = {
   raio:      0.16,
   velocidade: 80.0,  // unidades/s
   alcance:   260.0,  // distância máxima antes de ser removido
   passoMax:  0.6     // maior avanço testado por vez (evita atravessar paredes finas)
};

export class ShootingSystem {
   /**
    * @param {THREE.Scene} scene
    * @param {CameraController} cameraCtrl
    * @param {CollisionSystem} collision
    */
   constructor(scene, cameraCtrl, collision) {
      this.scene      = scene;
      this.cameraCtrl = cameraCtrl;
      this.collision  = collision;

      this.projeteis     = [];      // projéteis vivos
      this.cadencia      = 0.15;    // intervalo mínimo entre dois disparos (s)
      this.tempoDesdeTiro = this.cadencia;

      // Geometria e material reaproveitados por todos os projéteis
      this.geoProjetil = new THREE.SphereGeometry(PROJETIL.raio, 12, 12);
      this.matProjetil = new THREE.MeshLambertMaterial({ color: "rgb(255,210,60)" });

      this._criarArma();
      this._registrarEventos();
   }

   /**
    * Arma: um cilindro centralizado na parte inferior da janela.
    * Fica preso à câmera em primeira pessoa, portanto acompanha o olhar.
    * O objeto 'boca' marca a ponta do cano, de onde as esferas saem.
    */
   _criarArma() {
      this.arma = new THREE.Group();

      const comprimento = 1.5;
      const cano = new THREE.Mesh(
         new THREE.CylinderGeometry(0.13, 0.17, comprimento, 20),
         new THREE.MeshLambertMaterial({ color: "rgb(70,74,82)" })
      );
      // O cilindro nasce alinhado a Y; giramos -90° em X para apontar para -Z
      cano.rotation.x = -Math.PI / 2;
      this.arma.add(cano);

      // Anel na ponta do cano (apenas para dar volume à arma)
      const anel = new THREE.Mesh(
         new THREE.CylinderGeometry(0.19, 0.19, 0.16, 20),
         new THREE.MeshLambertMaterial({ color: "rgb(150,140,90)" })
      );
      anel.rotation.x = -Math.PI / 2;
      anel.position.z = -comprimento / 2;
      this.arma.add(anel);

      // Ponto de saída dos projéteis
      this.boca = new THREE.Object3D();
      this.boca.position.set(0, 0, -comprimento / 2 - 0.1);
      this.arma.add(this.boca);

      // Centralizado em X e junto à borda inferior da tela
      this.arma.position.set(0, -0.45, -1.0);
      this.arma.rotation.x = 0.05; // leve inclinação para cima

      this.cameraCtrl.fpCamera.add(this.arma);
   }

   _registrarEventos() {
      // Botões esquerdo (0) e direito (2) disparam. Cada clique = um disparo.
      document.addEventListener('mousedown', (event) => {
         if (!this.cameraCtrl.ativo) return;
         if (event.button === 0 || event.button === 2) this.atirar();
      });
      // Impede o menu de contexto do botão direito
      document.addEventListener('contextmenu', (event) => event.preventDefault());
   }

   /**
    * Cria um projétil saindo da boca do cano na direção da mira.
    * A mira está fixa no centro da tela, então a direção do tiro é obtida
    * apontando da boca do cano para um ponto distante sobre o eixo da câmera.
    */
   atirar() {
      if (this.tempoDesdeTiro < this.cadencia) return; // respeita a cadência
      this.tempoDesdeTiro = 0;

      const camera = this.cameraCtrl.fpCamera;

      // Origem: ponta do cilindro (em coordenadas de mundo)
      const origem = new THREE.Vector3();
      this.boca.getWorldPosition(origem);

      // Alvo: ponto distante exatamente sob a mira (centro da tela)
      const direcaoCamera = new THREE.Vector3();
      camera.getWorldDirection(direcaoCamera);
      const alvo = new THREE.Vector3()
         .copy(camera.position)
         .addScaledVector(direcaoCamera, PROJETIL.alcance);

      const direcao = alvo.sub(origem).normalize();

      const mesh = new THREE.Mesh(this.geoProjetil, this.matProjetil);
      mesh.position.copy(origem);
      this.scene.add(mesh);

      this.projeteis.push({ mesh: mesh, direcao: direcao, percorrido: 0 });
   }

   /**
    * Avança todos os projéteis e faz a gestão de remoção.
    * Um projétil é removido quando:
    *   - colide com o cenário (paredes, chão, escadas, portas fechadas...);
    *   - percorre mais que PROJETIL.alcance sem atingir nada.
    */
   update(delta) {
      this.tempoDesdeTiro += delta;

      const avanco = PROJETIL.velocidade * delta;
      // Sub-passos garantem que o projétil não "pule" por cima de uma parede fina
      const nSub   = Math.max(1, Math.ceil(avanco / PROJETIL.passoMax));
      const passo  = avanco / nSub;

      for (let i = this.projeteis.length - 1; i >= 0; i--) {
         const p = this.projeteis[i];
         let remover = false;

         for (let s = 0; s < nSub; s++) {
            p.mesh.position.addScaledVector(p.direcao, passo);
            p.percorrido += passo;

            if (this.collision.sphereHitsWorld(p.mesh.position, PROJETIL.raio)) { remover = true; break; }
            if (p.percorrido >= PROJETIL.alcance) { remover = true; break; }
         }

         if (remover) {
            this.scene.remove(p.mesh);
            this.projeteis.splice(i, 1);
         }
      }
   }

   /** Quantidade de projéteis ativos (mostrada no painel de informações). */
   get quantidade() { return this.projeteis.length; }

   /** A arma some quando estamos inspecionando o ambiente com a câmera orbital. */
   setVisivel(v) { this.arma.visible = v; }
}
