/**
 * =====================================================================================
 *  T2 - INIMIGOS
 * =====================================================================================
 *  Dois modelos importados (OBJ + MTL, assets/objects), dois inimigos de cada:
 *
 *    GUARDIÃO DA FLORESTA (Florest_Guardian) - monstro-árvore que se ARRASTA pelo
 *        chão, balançando o corpo. Morre com 5 disparos.
 *    DRAGÃO AZUL (BlueDragon) - VOA/flutua, subindo e descendo e inclinando nas
 *        curvas. Morre com 3 disparos.
 *
 *  Posicionamento (exigido pelo enunciado):
 *    - um dragão patrulha o CAMINHO DE RONDA da muralha oeste;
 *    - um guardião fica DENTRO dos alojamentos (construção interna oeste);
 *    - os outros dois ficam no pátio.
 *
 *  Cada inimigo tem:
 *    - uma luz pontual colorida de baixa intensidade (fácil de identificar);
 *    - uma barra de energia (dois planos sempre virados para a câmera);
 *    - ao zerar o HP, desaparece com uma transição de opacidade e solta uma chave.
 *  Os inimigos só existem no turno da NOITE (ver setNoite()). Eles não atacam.
 *
 *  Todos os materiais dos modelos são convertidos para MeshLambertMaterial
 *  (mantendo a textura), como pede o enunciado.
 * =====================================================================================
 */

import * as THREE from 'three';
import { OBJLoader } from '../build/jsm/loaders/OBJLoader.js';
import { MTLLoader } from '../build/jsm/loaders/MTLLoader.js';
import { getMaxSize } from '../libs/util/util.js';
import { ESCALA } from './environment.js';

const CAMINHO_MODELOS = './assets/objects/';

// Parâmetros de cada tipo de inimigo (medidas em unidades de MUNDO)
const TIPOS = {
   guardiao: {
      arquivo: 'Florest_Guardian', tamanho: 3.6, vida: 5, velocidade: 1.8,
      flutua: false, corLuz: "rgb(120,255,110)"
   },
   dragao: {
      arquivo: 'BlueDragon', tamanho: 4.4, vida: 3, velocidade: 3.2,
      flutua: true, alturaVoo: 1.6, corLuz: "rgb(90,170,255)"
   }
};

// Onde fica cada inimigo (coordenadas do CASTELO, multiplicadas por ESCALA).
//   'linha'  : patrulha indo e voltando entre a e b
//   'circulo': voa em círculo em volta do centro
//   'chao'   : altura do piso sob o inimigo (onde a chave cai quando ele morre)
const INSTANCIAS = [
   { tipo: 'dragao',   rota: 'linha',   a: [-39.6, 25, -22], b: [-39.6, 25, 22], chao: 25 }, // caminho de ronda oeste
   { tipo: 'guardiao', rota: 'linha',   a: [-25, 0, -8],     b: [-25, 0, 8],     chao: 0 },  // dentro dos alojamentos
   { tipo: 'dragao',   rota: 'circulo', centro: [0, 4, -18], raio: 7,            chao: 0 },  // pátio (voando)
   { tipo: 'guardiao', rota: 'linha',   a: [-12, 0, -27],    b: [10, 0, -27],    chao: 0 }   // pátio norte
];

const BARRA = { largura: 2.0, altura: 0.2, borda: 0.05 };
const TEMPO_MORTE = 1.4; // duração do fade-out (s)

export class SistemaDeInimigos {
   /**
    * @param {THREE.Scene} scene
    * @param {Function} aoMorrer callback(posicaoDoChao) - usado para soltar a chave
    */
   constructor(scene, aoMorrer) {
      this.scene    = scene;
      this.aoMorrer = aoMorrer;
      this.inimigos = [];
      this.noite    = false;
      this.carregado = false;

      // Geometrias/materiais compartilhados das barras de vida.
      // O preenchimento tem a origem na borda ESQUERDA: escalar em X "esvazia"
      // a barra da direita para a esquerda.
      this.geoFundo = new THREE.PlaneGeometry(BARRA.largura + 2 * BARRA.borda, BARRA.altura + 2 * BARRA.borda);
      this.geoBarra = new THREE.PlaneGeometry(BARRA.largura, BARRA.altura).translate(BARRA.largura / 2, 0, 0);

      this._carregarModelos();
   }

   // ---------------------------------------------------------------------------
   // CARREGAMENTO (mesmo padrão de examples/geometriesExternalObjects.js)
   // ---------------------------------------------------------------------------
   _carregarOBJ(nome) {
      return new Promise((resolve, reject) => {
         const mtlLoader = new MTLLoader();
         mtlLoader.setPath(CAMINHO_MODELOS);
         mtlLoader.load(nome + '.mtl', (materiais) => {
            materiais.preload();
            const objLoader = new OBJLoader();
            objLoader.setMaterials(materiais);
            objLoader.setPath(CAMINHO_MODELOS);
            objLoader.load(nome + '.obj', resolve, undefined, reject);
         }, undefined, reject);
      });
   }

   async _carregarModelos() {
      const nomes = Object.keys(TIPOS);
      const modelos = await Promise.all(nomes.map(n => this._carregarOBJ(TIPOS[n].arquivo)));
      const base = {};
      nomes.forEach((n, i) => base[n] = this._prepararModelo(modelos[i], TIPOS[n].tamanho));

      for (const def of INSTANCIAS) this._criarInimigo(def, base[def.tipo]);
      this.carregado = true;
      this.setNoite(this.noite);
   }

   /** Normaliza o tamanho, apoia a base em y = 0 e centraliza em XZ. */
   _prepararModelo(obj, tamanho) {
      const s = tamanho / getMaxSize(obj);
      obj.scale.set(s, s, s);
      const caixa = new THREE.Box3().setFromObject(obj);
      const centro = caixa.getCenter(new THREE.Vector3());
      obj.position.set(-centro.x, -caixa.min.y, -centro.z);

      const modelo = new THREE.Group();
      modelo.add(obj);
      return modelo;
   }

   _criarInimigo(def, modeloBase) {
      const tipo = TIPOS[def.tipo];

      // raiz (posição, nunca gira) -> corpo (orientação/animação) -> modelo
      const raiz = new THREE.Group();
      const corpo = new THREE.Group();
      const modelo = modeloBase.clone(true);
      corpo.add(modelo);
      raiz.add(corpo);
      this.scene.add(raiz);

      // Materiais próprios (Lambert) para cada inimigo: precisam ser independentes
      // para o "flash" de dano e para o fade-out de um não afetar os outros.
      const materiais = [];
      modelo.traverse((filho) => {
         if (!filho.isMesh) return;
         const converter = (m) => {
            const lambert = new THREE.MeshLambertMaterial({
               map: m.map || null,
               color: m.map ? 0xffffff : m.color,
               side: THREE.DoubleSide
            });
            materiais.push(lambert);
            return lambert;
         };
         filho.material = Array.isArray(filho.material) ? filho.material.map(converter)
                                                        : converter(filho.material);
         filho.castShadow = filho.receiveShadow = true;
      });

      // Dimensões já na escala final (para a barra, a luz e o acerto)
      const caixa = new THREE.Box3().setFromObject(modelo);
      const altura = caixa.max.y - caixa.min.y;
      const raioAcerto = 0.42 * Math.max(caixa.max.x - caixa.min.x, caixa.max.z - caixa.min.z);

      // Luz pontual de baixa intensidade, colorida, no meio do corpo
      const luz = new THREE.PointLight(tipo.corLuz, 0, 13, 1.4);
      luz.position.y = altura * 0.55;
      raiz.add(luz);

      // Barra de energia: fundo escuro + preenchimento. Usa Lambert com emissive
      // para ser legível tanto de dia quanto de noite.
      const barra = new THREE.Group();
      barra.position.y = altura + 0.6;
      const matFundo = new THREE.MeshLambertMaterial({ color: 0x000000, emissive: "rgb(25,8,8)",
                                                       transparent: true, opacity: 0.85 });
      const matBarra = new THREE.MeshLambertMaterial({ color: 0x000000, emissive: "rgb(60,230,70)",
                                                       transparent: true });
      const fundo = new THREE.Mesh(this.geoFundo, matFundo);
      const preench = new THREE.Mesh(this.geoBarra, matBarra);
      preench.position.set(-BARRA.largura / 2, 0, 0.01);
      barra.add(fundo, preench);
      raiz.add(barra);

      const ini = {
         def, tipo, raiz, corpo, luz, barra, preench, matBarra, matFundo, materiais,
         altura, raioAcerto,
         vida: tipo.vida, vidaMax: tipo.vida,
         t: Math.random(),          // fase da patrulha (0..1 ida e volta)
         sentido: 1,
         tempo: Math.random() * 10, // fase das animações
         flash: 0,
         morrendo: false, tMorte: 0, removido: false
      };
      // Posição inicial
      this._posicionar(ini, 0);
      this.inimigos.push(ini);
   }

   // ---------------------------------------------------------------------------
   // DIA / NOITE
   // ---------------------------------------------------------------------------
   /** Os inimigos (e suas luzes) só existem no turno da noite. */
   setNoite(noite) {
      this.noite = noite;
      for (const ini of this.inimigos) {
         if (ini.removido) continue;
         ini.raiz.visible = noite;
         // A luz não é removida (só a intensidade muda) para não mudar o número
         // de luzes da cena, o que forçaria a recompilação dos shaders.
         if (!noite) ini.luz.intensity = 0;
      }
   }

   // ---------------------------------------------------------------------------
   // DANO
   // ---------------------------------------------------------------------------
   /**
    * Verifica se um ponto (ponta do dardo) está dentro de algum inimigo vivo.
    * O volume de acerto é um cilindro vertical em volta do modelo.
    * @returns {Object|null} o inimigo atingido
    */
   testarAcerto(ponto) {
      if (!this.noite) return null;
      for (const ini of this.inimigos) {
         if (ini.removido || ini.morrendo) continue;
         const p = ini.raiz.position;
         const dx = ponto.x - p.x, dz = ponto.z - p.z;
         if (dx * dx + dz * dz > ini.raioAcerto * ini.raioAcerto) continue;
         if (ponto.y < p.y || ponto.y > p.y + ini.altura) continue;
         return ini;
      }
      return null;
   }

   /** Aplica um disparo de dano ao inimigo. */
   atingir(ini) {
      if (ini.morrendo) return;
      ini.vida = Math.max(0, ini.vida - 1);
      ini.flash = 1;
      if (ini.vida === 0) {
         ini.morrendo = true;
         ini.tMorte = 0;
         for (const m of ini.materiais) { m.transparent = true; m.depthWrite = false; }
      }
   }

   get vivos() {
      return this.inimigos.filter(i => !i.removido && !i.morrendo).length;
   }

   // ---------------------------------------------------------------------------
   // ATUALIZAÇÃO
   // ---------------------------------------------------------------------------
   _posicionar(ini, delta) {
      const tipo = ini.tipo, def = ini.def;
      const anterior = ini.raiz.position.clone();

      if (def.rota === 'linha') {
         const a = new THREE.Vector3(...def.a).multiplyScalar(ESCALA);
         const b = new THREE.Vector3(...def.b).multiplyScalar(ESCALA);
         const comp = a.distanceTo(b);
         ini.t += ini.sentido * (tipo.velocidade * delta) / comp;
         if (ini.t > 1) { ini.t = 1; ini.sentido = -1; }
         if (ini.t < 0) { ini.t = 0; ini.sentido = 1; }
         // Desacelera perto das pontas (suaviza a meia-volta)
         const s = ini.t * ini.t * (3 - 2 * ini.t);
         ini.raiz.position.lerpVectors(a, b, s);
      } else {
         const c = new THREE.Vector3(...def.centro).multiplyScalar(ESCALA);
         const r = def.raio * ESCALA;
         ini.t += (tipo.velocidade * delta) / r;
         ini.raiz.position.set(c.x + Math.cos(ini.t) * r, c.y, c.z + Math.sin(ini.t) * r);
      }

      // Altura: dragões voam (sobem e descem), guardiões se arrastam no chão
      if (tipo.flutua) ini.raiz.position.y += tipo.alturaVoo + Math.sin(ini.tempo * 2.2) * 0.35;

      // Orientação: vira suavemente para a direção do movimento
      const dir = ini.raiz.position.clone().sub(anterior);
      dir.y = 0;
      if (dir.lengthSq() > 1e-6) {
         const alvo = Math.atan2(dir.x, dir.z);
         let diff = alvo - ini.corpo.rotation.y;
         diff = Math.atan2(Math.sin(diff), Math.cos(diff)); // menor ângulo
         ini.corpo.rotation.y += diff * Math.min(1, 6 * delta);
         // Dragão inclina nas curvas
         if (tipo.flutua) ini.corpo.rotation.z = THREE.MathUtils.lerp(ini.corpo.rotation.z,
                                                     -diff * 0.6, Math.min(1, 4 * delta));
      }

      // Guardião: balanço lateral e "arrasto" (leve compressão) enquanto anda
      if (!tipo.flutua) {
         ini.corpo.rotation.z = Math.sin(ini.tempo * 3.0) * 0.06;
         ini.corpo.scale.y = 1 + Math.sin(ini.tempo * 6.0) * 0.025;
      }
   }

   /**
    * @param {number} delta
    * @param {THREE.Camera} camera câmera ativa (para as barras ficarem de frente)
    */
   update(delta, camera) {
      if (!this.carregado) return;

      for (const ini of this.inimigos) {
         if (ini.removido) continue;
         ini.tempo += delta;

         if (!ini.morrendo) this._posicionar(ini, delta);

         // Barra de energia: sempre virada para a câmera (a raiz não gira, então
         // basta copiar a orientação da câmera)
         ini.barra.quaternion.copy(camera.quaternion);
         const frac = ini.vida / ini.vidaMax;
         ini.preench.scale.x = Math.max(frac, 0.0001);
         // verde -> amarelo -> vermelho conforme a energia cai
         ini.matBarra.emissive.setRGB(Math.min(1, 2 * (1 - frac)) * 0.95, Math.min(1, 2 * frac) * 0.9, 0.12);

         // Flash de dano (emissive avermelhado que se apaga rapidamente)
         if (ini.flash > 0) ini.flash = Math.max(0, ini.flash - delta * 6);
         for (const m of ini.materiais) m.emissive.setRGB(ini.flash * 0.9, ini.flash * 0.15, ini.flash * 0.1);

         // Luz pontual (pulsa levemente para chamar atenção)
         let intensidadeLuz = this.noite ? 9 + Math.sin(ini.tempo * 4) * 2 : 0;

         // Morte: transição de opacidade, depois some e solta a chave
         if (ini.morrendo) {
            ini.tMorte += delta;
            const op = Math.max(0, 1 - ini.tMorte / TEMPO_MORTE);
            for (const m of ini.materiais) m.opacity = op;
            ini.matBarra.opacity = op;
            ini.matFundo.opacity = 0.85 * op;
            intensidadeLuz *= op;
            ini.corpo.position.y += delta * (ini.tipo.flutua ? 0.6 : -0.4); // afunda/sobe ao sumir
            if (op === 0) {
               ini.removido = true;
               this.scene.remove(ini.raiz);
               // A chave aparece no chão onde o inimigo estava
               const chao = ini.raiz.position.clone();
               chao.y = ini.def.chao * ESCALA;
               this.aoMorrer(chao);
            }
         }
         ini.luz.intensity = intensidadeLuz;
      }
   }
}
