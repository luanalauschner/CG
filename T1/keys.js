/**
 * =====================================================================================
 *  T2 - CHAVES
 * =====================================================================================
 *  - Ao ser eliminado, cada inimigo solta uma CHAVE: uma esfera com MeshPhongMaterial
 *    e atributo emissive (brilha mesmo no escuro);
 *  - A chave é adquirida quando o jogador chega suficientemente perto dela;
 *  - O HUD (canto superior direito) mostra quantas chaves o jogador carrega e
 *    quantas já estão nos pedestais;
 *  - Perto de um pedestal vazio, uma chave carregada é posicionada sobre ele
 *    (a luz pontual do pedestal acende, ver interior.js);
 *  - Tecla 'K': atribui todas as chaves ao jogador; pressionando de novo, ele volta
 *    a ter as chaves que possuía antes.
 * =====================================================================================
 */

import * as THREE from 'three';

export const TOTAL_CHAVES = 4;

const DIST_COLETA   = 2.6;  // distância (mundo) para pegar uma chave do chão
const DIST_PEDESTAL = 3.2;  // distância (no plano XZ) para posicionar no pedestal

// Geometria/material compartilhados por todas as chaves
let geoChave = null, matChave = null, geoHalo = null, matHalo = null;

/**
 * Cria a malha de uma chave: esfera Phong emissiva + um aro fino (também Phong)
 * girando em volta, para a chave ser reconhecível de longe.
 * @param {number} raio raio da esfera (unidades de mundo)
 */
export function criarMalhaChave(raio) {
   if (!geoChave) {
      geoChave = new THREE.SphereGeometry(1, 32, 24);
      matChave = new THREE.MeshPhongMaterial({
         color:     "rgb(255,214,90)",
         emissive:  "rgb(255,150,20)",
         emissiveIntensity: 0.9,
         specular:  "rgb(255,255,220)",
         shininess: 90
      });
      geoHalo = new THREE.TorusGeometry(1.45, 0.07, 8, 40);
      matHalo = new THREE.MeshPhongMaterial({
         color: "rgb(255,230,150)", emissive: "rgb(255,170,40)",
         emissiveIntensity: 0.7, shininess: 60
      });
   }
   const chave = new THREE.Group();
   const esfera = new THREE.Mesh(geoChave, matChave);
   const halo   = new THREE.Mesh(geoHalo, matHalo);
   halo.rotation.x = Math.PI / 2.6;
   esfera.castShadow = halo.castShadow = true;
   chave.add(esfera, halo);
   chave.scale.setScalar(raio);
   return chave;
}

export class SistemaDeChaves {
   /**
    * @param {THREE.Scene} scene
    * @param {Object} interior objeto retornado por createInterior()
    */
   constructor(scene, interior) {
      this.scene    = scene;
      this.interior = interior;
      this.raio     = interior.raioChave;

      this.noChao      = [];  // chaves soltas no cenário: { malha, base, tempo }
      this.carregadas  = 0;   // chaves que o jogador carrega agora
      this.trapaca     = false;
      this.salvas      = 0;   // chaves reais guardadas enquanto 'K' está ativo
      this.tempo       = 0;

      this._criarHUD();
      window.addEventListener('keydown', (e) => {
         if (e.code === 'KeyK' && !e.repeat) this.alternarTodas();
      });
   }

   /** Chamado quando um inimigo morre: a chave aparece no lugar dele. */
   soltarChave(posicao) {
      const malha = criarMalhaChave(this.raio);
      malha.position.copy(posicao);
      this.scene.add(malha);
      this.noChao.push({ malha, base: posicao.clone(), tempo: 0 });
   }

   /**
    * Tecla 'K'. Liga: guarda as chaves reais e passa a carregar todas as que ainda
    * não estão nos pedestais. Desliga: volta às chaves que possuía antes (sem
    * contar as que já foram colocadas nos pedestais).
    */
   alternarTodas() {
      const livres = TOTAL_CHAVES - this.interior.chavesPosicionadas;
      if (!this.trapaca) {
         this.salvas     = this.carregadas;
         this.carregadas = livres;
         this.trapaca    = true;
      } else {
         this.carregadas = Math.min(this.salvas, livres);
         this.trapaca    = false;
      }
      this._atualizarHUD();
   }

   /**
    * @param {number} delta
    * @param {THREE.Vector3} posJogador posição dos PÉS do jogador
    * @param {number} alturaJogador altura do personagem (para medir até o peito)
    */
   update(delta, posJogador, alturaJogador) {
      this.tempo += delta;
      const peito = posJogador.clone();
      peito.y += alturaJogador * 0.5;

      // --- Chaves no chão: flutuam, giram e são coletadas por proximidade -------
      for (let i = this.noChao.length - 1; i >= 0; i--) {
         const c = this.noChao[i];
         c.tempo += delta;
         // Ao cair, sobe um pouco e "assenta" flutuando
         const subida = Math.min(1, c.tempo / 0.6);
         c.malha.position.set(c.base.x,
                              c.base.y + 0.9 * subida + Math.sin(this.tempo * 2.5 + i) * 0.15,
                              c.base.z);
         c.malha.rotation.y += delta * 2;

         if (c.tempo > 0.4 && c.malha.position.distanceTo(peito) < DIST_COLETA) {
            this.scene.remove(c.malha);
            this.noChao.splice(i, 1);
            if (this.trapaca) this.salvas++;   // mantém o progresso real
            else              this.carregadas++;
            this._atualizarHUD(true);
         }
      }

      // --- Pedestais: posiciona uma chave em cada pedestal vazio próximo --------
      if (this.carregadas > 0) {
         const ped = this.interior.pedestais;
         for (let i = 0; i < ped.length && this.carregadas > 0; i++) {
            if (ped[i].chave) continue;
            const dx = ped[i].topo.x - posJogador.x, dz = ped[i].topo.z - posJogador.z;
            if (dx * dx + dz * dz > DIST_PEDESTAL * DIST_PEDESTAL) continue;
            if (Math.abs(ped[i].topo.y - posJogador.y) > 4) continue;

            this.carregadas--;
            this.interior.colocarChave(i, criarMalhaChave(this.raio));
            this._atualizarHUD(true);
         }
      }
   }

   // ---------------------------------------------------------------------------
   // HUD
   // ---------------------------------------------------------------------------
   _criarHUD() {
      this.hud = document.getElementById('hud-chaves');
      this.slots = [];
      const linha = this.hud.querySelector('.slots');
      for (let i = 0; i < TOTAL_CHAVES; i++) {
         const s = document.createElement('span');
         s.className = 'slot';
         linha.appendChild(s);
         this.slots.push(s);
      }
      this.texto = this.hud.querySelector('.texto');
      this._atualizarHUD();
   }

   _atualizarHUD(destaque = false) {
      const colocadas = this.interior.chavesPosicionadas;
      for (let i = 0; i < TOTAL_CHAVES; i++) {
         // Os primeiros slots são as chaves já nos pedestais, depois as carregadas
         this.slots[i].className = 'slot' +
            (i < colocadas ? ' colocada' : (i < colocadas + this.carregadas ? ' cheia' : ''));
      }
      this.texto.textContent =
         `Chaves: ${this.carregadas}  |  Pedestais: ${colocadas}/${TOTAL_CHAVES}` +
         (this.trapaca ? '  (K)' : '') +
         (this.interior.aberto ? '  -  PORTAL ABERTO!' : '');
      if (destaque) {
         this.hud.classList.remove('pulso');
         void this.hud.offsetWidth; // reinicia a animação CSS
         this.hud.classList.add('pulso');
      }
   }
}
