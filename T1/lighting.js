/**
 * =====================================================================================
 *  T2 - ILUMINAÇÃO: SISTEMA DE DIA E NOITE
 * =====================================================================================
 *  Dois horários (tecla 'H' alterna):
 * 
 *    - 10h: luz do sol, alta no céu, vinda do leste -> sombras curtas
 *    - 18h: luz da lua, azulada e fraca, vinda do oeste. Os inimigos só aparecem
 *      neste turno.
 *
 *  Luzes da cena:
 *    - luz direcional principal Sol/Lua: única que projeta sombra, em todos os
 *      elementos do ambiente;
 *    - luz direcional de preenchimento, mais fraca, na direção aproximadamente
 *      oposta à principal e sem sombra que só clareia as faces que ficariam pretas;
 *    - luz ambiente HemisphereLight bem fraca, para o céu/chão.
 *      Um disco emissivo do sol ou da lua é desenhado no céu, na direção da luz principal.
 *
 *  sombras - qualidade x desempenho:
 *    - A da sombra cobre só o castelo onde há objetos que
 *      projetam sombra, concentrando a resolução do mapa onde ela importa;
 *    - mapa de 4096x4096 com filtro PCF;
 *    - bias/normalBias ajustados para não haver "acne" nem "peter-panning".
 * =====================================================================================
 */

import * as THREE from 'three';
import { ESCALA } from './environment.js';

// Configuração de cada horário.
// elevacao/azimute: direção de onde vem a luz principal em graus


// Definindo horários de iluminação para o sistema de dia e noite

const HORARIOS = {
   dia: {
      nome: 'Dia (10h)',
      ceu: "rgb(132,178,226)", neblina: [260, 1100],
      principal: { cor: "rgb(255,244,226)", intensidade: 2.7, elevacao: 58, azimute: 145 },
      preench:   { cor: "rgb(180,200,255)", intensidade: 0.55 },
      ambiente:  { ceu: "rgb(200,220,255)", chao: "rgb(110,100,80)", intensidade: 0.75 },
      astro:     { cor: "rgb(255,240,190)", raio: 22 }
   },
   noite: {
      nome: 'Noite (18h)',
      ceu: "rgb(16,22,46)", neblina: [120, 700],
      principal: { cor: "rgb(150,170,255)", intensidade: 1.15, elevacao: 45, azimute: 215 },
      preench:   { cor: "rgb(80,90,150)",   intensidade: 0.3 },
      ambiente:  { ceu: "rgb(70,82,140)",   chao: "rgb(25,25,38)",   intensidade: 0.7 },
      astro:     { cor: "rgb(225,232,255)", raio: 14 }
   }
};

const DIST_LUZ   = 260;            // distância da luz principal até o alvo
const DIST_ASTRO = 900;            // distância do disco do Sol/Lua
const SOMBRA_LADO = 100 * ESCALA;  // metade do lado do frustum da sombra

export class SistemaDeIluminacao {
   /**
    * @param {THREE.Scene} scene
    * @param {THREE.WebGLRenderer} renderer
    */
   constructor(scene, renderer) {
      this.scene    = scene;
      this.renderer = renderer;
      this.ouvintes = [];  // funções chamadas com (noite) ao trocar o horário

      // --- Luz principal ---------------------------------------------

      this.principal = new THREE.DirectionalLight(0xffffff, 1);
      this.principal.castShadow = true;
      const sh = this.principal.shadow;
      sh.mapSize.set(4096, 4096);
      sh.camera.left = sh.camera.bottom = -SOMBRA_LADO;
      sh.camera.right = sh.camera.top = SOMBRA_LADO;
      sh.camera.near = 10;
      sh.camera.far  = DIST_LUZ + 2 * SOMBRA_LADO;
      sh.bias = -0.0004;
      sh.normalBias = 0.06;
      sh.radius = 2;
      scene.add(this.principal);
      scene.add(this.principal.target); // alvo na origem 

      // --- Luz de preenchimento oposta, sem sombra

      this.preench = new THREE.DirectionalLight(0xffffff, 1);
      this.preench.castShadow = false;
      scene.add(this.preench);
      scene.add(this.preench.target);

      // --- Luz ambiente 

      this.ambiente = new THREE.HemisphereLight(0xffffff, 0x000000, 1);
      scene.add(this.ambiente);

      // --- Sol / Lua disco emissivo no céu, não recebe nem projeta sombra

      this.matAstro = new THREE.MeshLambertMaterial({ color: 0x000000, emissive: 0xffffff, fog: false });
      this.astro = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), this.matAstro);
      scene.add(this.astro);

      scene.fog = new THREE.Fog(0xffffff, 100, 1000);

      this.noite = false;
      this._aplicar();
   }

   get nomeHorario() { return HORARIOS[this.noite ? 'noite' : 'dia'].nome; }

   /** Registra uma função chamada sempre que o horário muda. */

   aoMudar(fn) { this.ouvintes.push(fn); fn(this.noite); }

   alternar() {
      this.noite = !this.noite;
      this._aplicar();
   }

   _aplicar() {
      const h = HORARIOS[this.noite ? 'noite' : 'dia'];

      // Direção de onde vem a luz principal

      const el = THREE.MathUtils.degToRad(h.principal.elevacao);
      const az = THREE.MathUtils.degToRad(h.principal.azimute);
      const dir = new THREE.Vector3(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az));

      this.principal.color.set(h.principal.cor);
      this.principal.intensity = h.principal.intensidade;
      this.principal.position.copy(dir).multiplyScalar(DIST_LUZ);

      // Preenchimento: direção oposta no plano horizontal, vindo de cima
      
      this.preench.color.set(h.preench.cor);
      this.preench.intensity = h.preench.intensidade;
      this.preench.position.set(-dir.x, 0.6, -dir.z).normalize().multiplyScalar(DIST_LUZ);

      this.ambiente.color.set(h.ambiente.ceu);
      this.ambiente.groundColor.set(h.ambiente.chao);
      this.ambiente.intensity = h.ambiente.intensidade;

      this.renderer.setClearColor(h.ceu);
      this.scene.fog.color.set(h.ceu);
      this.scene.fog.near = h.neblina[0];
      this.scene.fog.far  = h.neblina[1];

      this.matAstro.emissive.set(h.astro.cor);
      this.astro.scale.setScalar(h.astro.raio);
      this.astro.position.copy(dir).multiplyScalar(DIST_ASTRO);

      for (const fn of this.ouvintes) fn(this.noite);
   }
}
