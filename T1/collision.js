/**
 * =====================================================================================
 *  T1 - SISTEMA DE COLISÃO
 * =====================================================================================
 *  Responsável por:
 *    - Registrar os "colisores" (volumes de colisão) de todos os elementos do cenário;
 *    - Mover o personagem resolvendo as colisões, produzindo o efeito de "deslize"
 *      nas paredes (sem travar e sem atravessar);
 *    - Aplicar gravidade, permitindo subir escadas suavemente (como se fosse rampa)
 *      e cair de blocos altos de forma interpolada (nunca instantânea);
 *    - Testar a colisão dos projéteis do sistema de disparos com o cenário.
 *
 *  MODELO ADOTADO
 *  --------------
 *  O personagem é representado por um CILINDRO VERTICAL (raio + altura) cuja base
 *  ("pés") fica em actor.position. O cenário é representado por dois tipos de volume:
 *
 *    'box'      -> THREE.Box3 alinhada aos eixos (paralelepípedos: muros, degraus...)
 *    'cylinder' -> cilindro vertical (torres circulares, poço, barris...)
 *
 *  Como todo o teste horizontal é "círculo x forma" no plano XZ, o empurrão de saída
 *  é sempre feito na direção da menor penetração. Só a componente NORMAL do movimento
 *  é cancelada, então a componente TANGENCIAL é preservada: é exatamente isso que
 *  produz o efeito de deslize ao longo das paredes.
 *
 *  TRUQUE DAS ESCADAS
 *  ------------------
 *  O teste horizontal ignora tudo que estiver abaixo de (pés + STEP_HEIGHT).
 *  Assim, um degrau baixo simplesmente não bloqueia o personagem; em seguida a
 *  resolução vertical encontra o topo do degrau como "chão" e eleva o personagem.
 *  A câmera não usa a altura física diretamente: ela segue uma altura suavizada
 *  (ver cameraShooting.js), o que elimina os sobressaltos ao subir escadas.
 * =====================================================================================
 */

import * as THREE from 'three';

// ---------------------------------------------------------------------------------
// Constantes de simulação
// ---------------------------------------------------------------------------------
export const GRAVITY     = 26.0;  // aceleração da gravidade (unidades/s²)
export const STEP_HEIGHT = 0.75;  // altura máxima de degrau que o personagem sobe sozinho
export const MAX_FALL    = 60.0;  // velocidade terminal de queda

/**
 * Cria o "ator" (personagem) usado pelo sistema de colisão.
 * @param {THREE.Vector3} position posição dos PÉS do personagem
 * @param {number} radius raio do cilindro de colisão
 * @param {number} height altura total do personagem
 */
export function createActor(position, radius, height) {
   return {
      position:  position.clone(), // posição dos pés
      radius:    radius,
      height:    height,
      velocityY: 0.0,              // velocidade vertical (gravidade/queda)
      onGround:  false             // true quando existe apoio sob os pés
   };
}

export class CollisionSystem {
   /**
    * @param {number} groundY altura do plano de chão infinito do cenário
    */
   constructor(groundY = 0.0) {
      this.groundY   = groundY;
      this.colliders = [];
   }

   // ------------------------------------------------------------------------------
   // REGISTRO DE COLISORES
   // ------------------------------------------------------------------------------

   /**
    * Registra um paralelepípedo de colisão a partir de uma malha.
    * A caixa é obtida em coordenadas de MUNDO com THREE.Box3.setFromObject().
    *
    * @param {THREE.Object3D} mesh malha (ou grupo) que gerará o volume
    * @param {Object} options
    *        options.dynamic  -> true quando a malha se move (portas); a caixa é
    *                            recalculada a cada quadro em refreshDynamic()
    *        options.isActive -> função que retorna false para desligar o colisor
    *                            (usado para "desligar" a porta quando ela abre)
    */
   addBox(mesh, options = {}) {
      const collider = {
         type:     'box',
         mesh:     mesh,
         box:      new THREE.Box3().setFromObject(mesh),
         dynamic:  options.dynamic === true,
         isActive: options.isActive || null
      };
      this.colliders.push(collider);
      return collider;
   }

   /**
    * Registra um cilindro vertical de colisão.
    * O centro (XZ) e a faixa de altura são extraídos da caixa envolvente da malha;
    * o raio é informado porque a caixa envolvente de um cilindro é um quadrado.
    *
    * @param {THREE.Object3D} mesh malha do cilindro
    * @param {number} radius raio de colisão
    */
   addCylinder(mesh, radius) {
      const box = new THREE.Box3().setFromObject(mesh);
      const collider = {
         type:     'cylinder',
         mesh:     mesh,
         x:        (box.min.x + box.max.x) * 0.5,
         z:        (box.min.z + box.max.z) * 0.5,
         radius:   radius,
         minY:     box.min.y,
         maxY:     box.max.y,
         dynamic:  false,
         isActive: null
      };
      this.colliders.push(collider);
      return collider;
   }

   /** Recalcula as caixas dos colisores marcados como dinâmicos (portas em movimento). */
   refreshDynamic() {
      for (let i = 0; i < this.colliders.length; i++) {
         const c = this.colliders[i];
         if (c.dynamic && c.mesh) c.box.setFromObject(c.mesh);
      }
   }

   // ------------------------------------------------------------------------------
   // CONSULTAS AUXILIARES (usadas internamente e pelo sistema de disparos)
   // ------------------------------------------------------------------------------

   /** Um colisor está ativo? (portas abertas ficam inativas) */
   _isActive(c) {
      return (c.isActive === null) || c.isActive();
   }

   /** Limite inferior do colisor no eixo Y. */
   _bottomOf(c) { return (c.type === 'box') ? c.box.min.y : c.minY; }

   /** Limite superior do colisor no eixo Y. */
   _topOf(c) { return (c.type === 'box') ? c.box.max.y : c.maxY; }

   /**
    * Interseção, no plano XZ, entre um círculo (px,pz,r) e uma caixa.
    * @returns {null|{nx:number, nz:number, depth:number}} normal de saída e penetração
    */
   _circleVsBox(px, pz, r, box) {
      // Ponto da caixa mais próximo do centro do círculo
      const cx = THREE.MathUtils.clamp(px, box.min.x, box.max.x);
      const cz = THREE.MathUtils.clamp(pz, box.min.z, box.max.z);

      const dx = px - cx;
      const dz = pz - cz;
      const d2 = dx * dx + dz * dz;

      if (d2 > r * r) return null; // sem colisão

      if (d2 > 1e-10) {
         // Centro do círculo FORA da caixa: empurra na direção do ponto mais próximo.
         // Isso trata cantos corretamente e gera o deslize suave.
         const d = Math.sqrt(d2);
         return { nx: dx / d, nz: dz / d, depth: r - d };
      }

      // Centro do círculo DENTRO da caixa: empurra pela face mais próxima
      const toMinX = px - box.min.x, toMaxX = box.max.x - px;
      const toMinZ = pz - box.min.z, toMaxZ = box.max.z - pz;
      const menor  = Math.min(toMinX, toMaxX, toMinZ, toMaxZ);

      if (menor === toMinX) return { nx: -1, nz:  0, depth: toMinX + r };
      if (menor === toMaxX) return { nx:  1, nz:  0, depth: toMaxX + r };
      if (menor === toMinZ) return { nx:  0, nz: -1, depth: toMinZ + r };
      return                       { nx:  0, nz:  1, depth: toMaxZ + r };
   }

   /**
    * Interseção, no plano XZ, entre um círculo (px,pz,r) e um cilindro vertical.
    * @returns {null|{nx:number, nz:number, depth:number}}
    */
   _circleVsCylinder(px, pz, r, c) {
      const dx = px - c.x;
      const dz = pz - c.z;
      const R  = r + c.radius;
      const d2 = dx * dx + dz * dz;

      if (d2 > R * R) return null;

      const d = Math.sqrt(d2);
      if (d < 1e-6) return { nx: 1, nz: 0, depth: R }; // centros coincidentes
      return { nx: dx / d, nz: dz / d, depth: R - d };
   }

   /** O círculo (px,pz,r) sobrepõe o colisor 'c' quando visto de cima? */
   _overlapsXZ(px, pz, r, c) {
      return (c.type === 'box')
         ? this._circleVsBox(px, pz, r, c.box) !== null
         : this._circleVsCylinder(px, pz, r, c) !== null;
   }

   // ------------------------------------------------------------------------------
   // MOVIMENTAÇÃO DO PERSONAGEM
   // ------------------------------------------------------------------------------

   /**
    * Move o ator aplicando o deslocamento horizontal desejado e a gravidade,
    * resolvendo todas as colisões do caminho.
    *
    * @param {Object} actor  ator criado por createActor()
    * @param {number} dx     deslocamento desejado em X (já multiplicado por delta)
    * @param {number} dz     deslocamento desejado em Z
    * @param {number} delta  tempo do quadro em segundos
    */
   moveActor(actor, dx, dz, delta) {
      const feetBefore = actor.position.y;

      // --- 1) Movimento horizontal + resolução (deslize) ---------------------------
      actor.position.x += dx;
      actor.position.z += dz;
      this._resolveHorizontal(actor);

      // --- 2) Movimento vertical (gravidade) --------------------------------------
      actor.velocityY = Math.max(actor.velocityY - GRAVITY * delta, -MAX_FALL);
      actor.position.y += actor.velocityY * delta;

      // --- 3) Resolução vertical (apoio no chão / teto) ---------------------------
      this._resolveVertical(actor, feetBefore);
   }

   /**
    * Empurra o ator para fora de todos os volumes com os quais ele se sobrepõe.
    * Repete algumas vezes porque sair de um volume pode gerar entrada em outro
    * (cantos, junção de dois blocos etc.).
    */
   _resolveHorizontal(actor) {
      // Faixa vertical do CORPO considerada na colisão horizontal.
      // Começando em (pés + STEP_HEIGHT), degraus baixos são ignorados de propósito:
      // é isso que permite subir escadas sem travar.
      const bodyMin = actor.position.y + STEP_HEIGHT;
      const bodyMax = actor.position.y + actor.height;

      for (let iter = 0; iter < 4; iter++) {
         let empurrou = false;

         for (let i = 0; i < this.colliders.length; i++) {
            const c = this.colliders[i];
            if (!this._isActive(c)) continue;

            // Descarta o que não cruza a faixa vertical do corpo
            if (this._topOf(c) <= bodyMin || this._bottomOf(c) >= bodyMax) continue;

            const hit = (c.type === 'box')
               ? this._circleVsBox(actor.position.x, actor.position.z, actor.radius, c.box)
               : this._circleVsCylinder(actor.position.x, actor.position.z, actor.radius, c);
            if (hit === null) continue;

            // Remove apenas a penetração ao longo da normal -> o movimento tangencial
            // é preservado e o personagem "escorrega" pela parede.
            actor.position.x += hit.nx * (hit.depth + 1e-4);
            actor.position.z += hit.nz * (hit.depth + 1e-4);
            empurrou = true;
         }

         if (!empurrou) break; // já está livre
      }
   }

   /**
    * Coloca o ator sobre a superfície de apoio mais alta que ele consegue alcançar
    * e impede que a cabeça atravesse um teto.
    *
    * @param {Object} actor
    * @param {number} feetBefore altura dos pés ANTES do movimento deste quadro
    */
   _resolveVertical(actor, feetBefore) {
      // Só é possível se apoiar em superfícies até STEP_HEIGHT acima de onde estávamos.
      // Assim o topo de um muro de 14 unidades não "puxa" o jogador que está no chão.
      const alcance = feetBefore + STEP_HEIGHT + 1e-4;
      let apoio = this.groundY;

      for (let i = 0; i < this.colliders.length; i++) {
         const c = this.colliders[i];
         if (!this._isActive(c)) continue;

         const topo = this._topOf(c);
         if (topo > alcance || topo <= apoio) continue;
         if (!this._overlapsXZ(actor.position.x, actor.position.z, actor.radius, c)) continue;

         apoio = topo;
      }

      if (actor.position.y <= apoio) {
         // Encostou no apoio: zera a queda. Note que a subida de um degrau acontece
         // aqui, de forma discreta - a suavização é feita na altura da câmera.
         actor.position.y = apoio;
         actor.velocityY  = 0.0;
         actor.onGround   = true;
      } else {
         actor.onGround = false;
      }

      // Teto: só interessa quando o personagem está subindo (degrau alto sob uma verga)
      if (actor.velocityY > 0) {
         const cabeca = actor.position.y + actor.height;
         for (let i = 0; i < this.colliders.length; i++) {
            const c = this.colliders[i];
            if (!this._isActive(c)) continue;

            const base = this._bottomOf(c);
            if (base <= actor.position.y || base >= cabeca) continue;
            if (!this._overlapsXZ(actor.position.x, actor.position.z, actor.radius, c)) continue;

            actor.position.y = Math.max(apoio, base - actor.height);
            actor.velocityY  = 0.0;
            break;
         }
      }
   }

   // ------------------------------------------------------------------------------
   // COLISÃO DOS PROJÉTEIS
   // ------------------------------------------------------------------------------

   /**
    * Testa se uma esfera (projétil) encostou em alguma geometria do cenário,
    * incluindo o plano de chão.
    *
    * @param {THREE.Vector3} center centro da esfera
    * @param {number} radius raio da esfera
    * @returns {boolean} true se houve colisão
    */
   /**
 * Detecta a colisão da esfera com o cenário e retorna a normal da colisão.
 *
 * @param {THREE.Vector3} center centro da esfera
 * @param {number} radius raio da esfera
 * @returns {null|{nx:number, ny:number, nz:number, depth:number}}
 */
sphereCollision(center, radius) {

   // ==========================================================
   // COLISÃO COM O CHÃO
   // ==========================================================

   if (center.y - radius <= this.groundY) {

      return {
         nx: 0,
         ny: 1,
         nz: 0,
         depth: this.groundY - (center.y - radius)
      };
   }

   // ==========================================================
   // COLISÃO COM OS OBJETOS
   // ==========================================================

   for (let i = 0; i < this.colliders.length; i++) {

      const c = this.colliders[i];

      if (!this._isActive(c)) continue;

      // Verifica se a esfera está dentro da altura do objeto
      if (center.y + radius < this._bottomOf(c)) continue;

      if (center.y - radius > this._topOf(c)) continue;

      let hit = null;

      // --------------------------------------------------------
      // CAIXA
      // --------------------------------------------------------

      if (c.type === 'box') {

         hit = this._circleVsBox(
            center.x,
            center.z,
            radius,
            c.box
         );
      }

      // --------------------------------------------------------
      // CILINDRO
      // --------------------------------------------------------

      else if (c.type === 'cylinder') {

         hit = this._circleVsCylinder(
            center.x,
            center.z,
            radius,
            c
         );
      }

      // --------------------------------------------------------
      // COLISÃO ENCONTRADA
      // --------------------------------------------------------

      if (hit !== null) {

         return {
            nx: hit.nx,
            ny: 0,
            nz: hit.nz,
            depth: hit.depth
         };
      }
   }

   return null;
}
}
