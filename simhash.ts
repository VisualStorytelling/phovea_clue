import {IDType} from "../caleydo_core/idtype";
import {isUndefined} from "../caleydo_core/main";
import Color = d3.Color;
import idtype = require('../caleydo_core/idtype')
import {IStateToken, StateTokenLeaf, StateTokenNode,TokenType} from "./statetoken";
import events = require('../caleydo_core/event');
import {StateNode} from "./prov";



class HashTable {

  constructor(maxSize:number) {
    this.maxSize = maxSize
  }

  dict:string[] = [];
  hashes:string[] = [];
  probs:number[] = []
  maxSize:number;


  push(value:string, prob:number, hash:string) {
    if (hash == null) hash = String(murmurhash2_32_gc(value, 0))
    let index = this.dict.indexOf(value)
    if (index < 0) {
      index = this.dict.length
    }
    this.dict[index] = value
    this.probs[value] = prob;
    this.hashes[value] = hash;
  }

  toHash(n:number):string {
    if (Object.keys(this.probs).length==0) {
      let st: string = "";
      for (let i:number = 0; i < n; i++) {
        st = st + "0"
      }
      return st;
    }

    let cdf:number[] = [];
    let lastElement = this.probs[this.dict[this.dict.length - 1]]
    if (lastElement == null) lastElement=0
    cdf[0] = lastElement;

    for (var i:number = 1; i < this.dict.length; i++) {
      let val:number = this.probs[this.dict[this.dict.length - i-1]]
      val = isUndefined(val) ? 0 : val;
      cdf[i] = cdf[i - 1] + val;
    }
    cdf = cdf.reverse()
    for (var i:number = 0; i < this.dict.length; i++) {
      cdf[i] = this.probs[this.dict[i]] / cdf[i]
    }

    var rng:RNG = new RNG(1)
    var samples:number[] = []
    for (var i:number=0; i < n; i++){
      var found: boolean = false
      for (var j: number=0; j < this.maxSize; j++) {
        var rndN:number = rng.nextDouble()
        if (!found && rndN < cdf[j]){
          samples[i] = j
          found = true
        }
      }
    }

    var hash:string = "";
    for (var i:number=0; i < n; i++) {
      let hashPart = this.hashes[this.dict[samples[i]]]
      let bitToUse  = hashPart.charAt(i % hashPart.length) // use the "bitToUse" bit of "hashPart"
      hash = hash + bitToUse
    }
    this.hashes = []
    this.probs = []
    return hash;
  }
}

export class MatchedTokenTree {
  private root:TreeNode = new TreeRoot(null, null)

  constructor(left:IStateToken[], right:IStateToken[]) {
    //let matchedTokens = SimHash.matchTokens(left, right)
    this.matchIntoNode(this.root, new StateTokenNode("dummyRoot", 1, left), new StateTokenNode("dummyRoot", 1, right))
    this.root.balanceWeights(1);
    let sim = this.similarity;
  }


  // matches lists of tokens according to a venn diagramm
  matchTokens(leftList:IStateToken[], rightList:IStateToken[]){
    let left:IStateToken[]=[];
    let center = [];
    let right:IStateToken[] = [];
    for (let i=0; i < leftList.length; i++) {
      let found:boolean= false;
      for (let j = 0; j < rightList.length; j++) {
        if (leftList[i].name === rightList[j].name) {
          center = center.concat({"left": leftList[i], "right": rightList[j]})
          found = true;
          break;
        }
      }
      if (!found) left = left.concat(leftList[i])
    }
    for (let i=0; i < rightList.length; i++) {
      let found:boolean= false;
      for (let j = 0; j < leftList.length; j++) {
        if (rightList[i].name === leftList[j].name) {
          found = true;
          break;
        }
      }
      if (!found) right = right.concat(rightList[i])
    }
    return [left, center, right]
  }

  matchIntoNode(root:TreeNode, left:IStateToken, right:IStateToken) {
    if (left === null && right === null) {
      //nothing to do
      return;
    } else if (left === null || right === null) {
      if (left === null) {
        if (!(right.isLeaf)) {
          for (let j = 0; j < (<StateTokenNode>right).childs.length; j++) {
            let node = new TreeNode(null, (<StateTokenNode>right).childs[j])
            this.matchIntoNode(node, null, (<StateTokenNode>right).childs[j])
            root.appendChild(node)
          }
        }
      } else if (right === null) {
        if (!(left.isLeaf)) {
          for (let j = 0; j < (<StateTokenNode>left).childs.length; j++) {
            let node = new TreeNode((<StateTokenNode>left).childs[j], null)
            this.matchIntoNode(node, (<StateTokenNode>left).childs[j], null)
            root.appendChild(node)
          }
        }
      }
    } else {

      if (left.isLeaf || right.isLeaf) {
        return;
      } else {
        let leftNode = <StateTokenNode> left;
        let rightNode = <StateTokenNode> right;
        let matchedTokens = this.matchTokens(leftNode.childs, rightNode.childs)
        for (let j = 0; j < matchedTokens[0].length; j++) {
          let node = new TreeNode(matchedTokens[0][j], null)
          this.matchIntoNode(node, matchedTokens[0][j], null)
          root.appendChild(node)
        }

        for (let j = 0; j < matchedTokens[1].length; j++) {
          let node = new TreeNode(matchedTokens[1][j]["left"],matchedTokens[1][j]["right"])
          this.matchIntoNode(node, matchedTokens[1][j]["left"],matchedTokens[1][j]["right"])
          root.appendChild(node)
        }

        for (let j = 0; j < matchedTokens[2].length;j++) {
          let node = new TreeNode(null,matchedTokens[2][j])
          this.matchIntoNode(node, null, matchedTokens[2][j])
          root.appendChild(node)
        }
      }
    }
  }

  private _similarity

  get similarityForLineup() {
    let leafs:TreeNode[] = this.root.leafs;
    var leftSims = [0,0,0,0,0];
    var centerSims = [0,0,0,0,0];
    var rightSims = [0,0,0,0,0];
    for (let i = 0; i < leafs.length; i++) {
      if (leafs[i].isPaired) {
        centerSims[leafs[i].category] += leafs[i].importance*leafs[i].tokenSimilarity
      } else {
        if (leafs[i].hasLeftToken) {
          leftSims[leafs[i].category] += leafs[i].importance*leafs[i].tokenSimilarity
        } else {
          rightSims[leafs[i].category] += leafs[i].importance*leafs[i].tokenSimilarity
        }
      }
    }
    let weights = SimHash.hasher.categoryWeighting;
    let total = 0;
    for (let i = 0; i < weights.length; i++) {
      leftSims[i] = leftSims[i] * weights[i]/100
      total += leftSims[i]
      centerSims[i] = centerSims[i] * weights[i]/100
      total += centerSims[i]
      rightSims[i] = rightSims[i] * weights[i]/100
      total += rightSims[i]
    }

    for (let i = 0; i < weights.length; i++) {
      leftSims[i] = leftSims[i] / total
      centerSims[i] = centerSims[i] / total
      rightSims[i] = rightSims[i] / total
    }

    return [leftSims, centerSims, rightSims]
  }


  get similarityPerCategory() {
    let leafs:TreeNode[] = this.root.leafs;
    let weights = SimHash.hasher.categoryWeighting
    var sims = [0,0,0,0,0];
    var total = [0,0,0,0,0]
    for (let i = 0; i < leafs.length; i++) {
      total[leafs[i].category] += leafs[i].importance
      sims[leafs[i].category] += leafs[i].isPaired ? leafs[i].importance*leafs[i].tokenSimilarity : 0
    }
    for (let i = 0; i < weights.length; i++) {
      sims[i] = total[i]=== 0 ? 1 : sims[i] / total[i]
    }
    this._similarity = sims;
    return sims;
  }

  get similarity() {
    let weights = SimHash.hasher.categoryWeighting
    var sims = this.similarityPerCategory
    let sim = 0;
    for (let i = 0; i < weights.length; i++) {
      sim += sims[i] === 0 ? weights[i]/100 : sims[i]*weights[i]/100
    }
    return sim;
  }
}



class TreeNode {
  private childs:TreeNode[]= [];
  private leftToken:IStateToken;
  private rightToken:IStateToken;

  constructor(left:IStateToken, right:IStateToken) {
    this.leftToken = left;
    this.rightToken = right;
  }

  appendChild(ch:TreeNode) {
    this.childs = this.childs.concat(ch)
  }

  static categories = ["data", "visual", "selection", "layout", "analysis"]

  public get tokenSimilarity():number{
    if (this.leftToken === null || this.rightToken=== null) return 0;
    if (!this.leftToken.isLeaf) {
      throw Error("Only Leafs' similarity should be used")
    } else {
      switch((<StateTokenLeaf>this.leftToken).type) {
        case 0:
              return (<StateTokenLeaf>this.leftToken).value === (<StateTokenLeaf>this.leftToken).value ? 1:0;
        case 1:
          let left:StateTokenLeaf = <StateTokenLeaf>this.leftToken
          let right:StateTokenLeaf = <StateTokenLeaf>this.rightToken
          let leftpct = (left.value[2]-left.value[0])/(left.value[1]-left.value[0])
          let rightpct = (right.value[2]-right.value[0])/(right.value[1]-right.value[0])
              return 1-Math.abs(leftpct-rightpct)
        case 2:
        case 3:
          //TODO
          return 1;
      }
    }
  }

  public get category():number {
    if (!(this.isLeafNode)) return null;
    let cat = this.leftToken=== null ? (<StateTokenLeaf>this.rightToken).category : (<StateTokenLeaf>this.leftToken).category
    return TreeNode.categories.indexOf(cat);
  }

  get importance():number{
    return this.leftToken !== null ? this.leftToken.importance: this.rightToken.importance
  }

  get isRoot():boolean{
    return false;
  }
  get name():string {
    let name = this.leftToken === null ? null : this.leftToken.name;
    if (name == null) name = this.rightToken === null ? null : this.rightToken.name;
    return name;
  }

  balanceWeights(targetWeight:number) {
    let factor:number = 1
    for (let i = 0; i < this.childs.length; i++) {
      if (this.childs[i].isPaired) {
        if (this.childs[i].leftToken.importance !== this.childs[i].rightToken.importance) {
          factor =  this.childs[i].leftToken.importance / this.childs[i].rightToken.importance
          break;
        }
      }
    }
    if (factor > 1) {
      for (let i = 0; i < this.childs.length; i++) {
        if (!(this.childs[i].leftToken === null)) this.childs[i].leftToken.importance /= factor
      }
    } else if (factor <1) {
      for (let i = 0; i < this.childs.length; i++) {
        if (!(this.childs[i].rightToken === null)) this.childs[i].rightToken.importance *= factor
      }
    }
    let sumFactor = 0;
    for (let i = 0; i < this.childs.length; i++) {
      if (this.childs[i].leftToken !== null) {
        sumFactor += this.childs[i].leftToken.importance
      } else if (this.childs[i].rightToken !== null) {
        sumFactor += this.childs[i].rightToken.importance
      }
    }
    if (sumFactor !== targetWeight) {
      for (let i = 0; i < this.childs.length; i++) {
        if (this.childs[i].leftToken !== null) {
          this.childs[i].leftToken.importance *= (targetWeight / sumFactor)
        }
        if (this.childs[i].rightToken !== null) {
          this.childs[i].rightToken.importance *= (targetWeight / sumFactor)
        }
      }
    }
    //balance all childs
      for (let i = 0; i < this.childs.length; i++) {
        if (!(this.childs[i].isLeafNode)) {
          this.childs[i].balanceWeights(this.childs[i].leftToken !== null ? this.childs[i].leftToken.importance : this.childs[i].rightToken.importance)
        }
      }
  }

  get isLeafNode():boolean {
    return this.childs.length === 0
  }
  get isPaired():boolean {
    return (this.leftToken !== null && this.rightToken !== null)
  }

  get hasLeftToken():boolean{
    return !this.leftToken===null
  }

  get leafs():TreeNode[] {
    let leafs:TreeNode[] =  []
    if (!this.isLeafNode) {
      for (let i = 0; i < this.childs.length ; i++) {
        leafs = leafs.concat(this.childs[i].leafs)
      }
    } else {
      return [this];
    }
    return leafs;
  }
}

class TreeRoot extends TreeNode {

  get isRoot():boolean{
    return true;
  }
}
export class SimHash extends events.EventHandler{

  private static _instance:SimHash = new SimHash();

  private _catWeighting:number[] = [30, 20, 25, 20, 5];
  private _nrBits:number = 200;

  public static get hasher():SimHash {
    return this._instance;
  }

  private hashTable:HashTable[] = [];
  private _HashTableSize:number = 1000;

  get categoryWeighting() {
    return this._catWeighting;
  }

  set categoryWeighting(weighting) {
    this._catWeighting = weighting;
    //this.fire('weighting_change');
  }

  getHashOfIDTypeSelection(type:IDType, selectionType):string {
    let selection:number[] = type.selections(selectionType).dim(0).asList(0);
    let allTokens:StateTokenLeaf[] = [];
    for (var sel of selection) {
      var t = new StateTokenLeaf(
        "dummy",
        1,
        TokenType.string,
        sel.toString(),
        ""
      )
      allTokens = allTokens.concat(t);
    }
    if (this.hashTable[type.id] == null) {
      this.hashTable[type.id] = new HashTable(this._HashTableSize)
    }
    for (let i:number = 0; i < allTokens.length; i++) {
      this.hashTable[type.id].push(allTokens[i].value, allTokens[i].importance, null)
    }
    return this.hashTable[type.id].toHash(this._nrBits)
  }

  getHashOfOrdinalIDTypeSelection(type:IDType, min:number, max:number, selectionType):string {
    if (this.hashTable[type.id] == null) {
      this.hashTable[type.id] = new HashTable(this._HashTableSize)
    }
    let selection:number[] = type.selections(selectionType).dim(0).asList(0);
    for (var sel of selection) {
      this.hashTable[type.id].push(
        String(sel),
        1,
        ordinalHash(min, max, sel, this._nrBits))
    }
    return this.hashTable[type.id].toHash(this._nrBits)
  }


  private prepHashCalc(tokens:StateTokenLeaf[], needsNormalization:boolean = true) {
    function groupBy(arr:StateTokenLeaf[]) {
      return arr.reduce(function (memo, x:StateTokenLeaf) {
          if (!memo[x.type]) {
            memo[x.type] = []
          }
          memo[x.type].push(x);
          return memo;
        }, {}
      );
    }

    if (needsNormalization && typeof tokens != 'undefined') {
      let totalImportance = tokens.reduce((prev, a:IStateToken) => prev + a.importance, 0)
      for (let i:number = 0; i < tokens.length; i++) {
        tokens[i].importance /= totalImportance
      }
    }

    return groupBy(tokens)
  }


  public calcHash(tokens:IStateToken[]):string[] {
    if (tokens.length == 0) {
      return ["invalid", "invalid", "invalid", "invalid", "invalid"]
    }
    tokens = SimHash.normalizeTokenPriority(tokens, 1)
    let leafs:StateTokenLeaf[] = this.filterLeafsAndSerialize(tokens)

    function groupBy(arr:StateTokenLeaf[]) {
      return arr.reduce(function (memo, x:StateTokenLeaf) {
          if (!memo[x.category]) {
            memo[x.category] = []
          }
          memo[x.category].push(x);
          return memo;
        }, {}
      );
    }

    let categories = ["data", "visual", "selection", "layout", "analysis"]

    let hashes:string[] = []
    let groupedTokens = groupBy(leafs)
    for (let i = 0; i < 5; i++) {
      hashes[i] = this.calcHashOfCat(groupedTokens[categories[i]], categories[i])
    }
    return hashes
  }

  private calcHashOfCat(tokens:StateTokenLeaf[], cat:string) {
    if (!(typeof tokens != 'undefined')) return Array(this._nrBits + 1).join("0")

    let b:number = 0;
    let splitTokens = this.prepHashCalc(tokens)
    if (this.hashTable[cat] == null) {
      this.hashTable[cat] = new HashTable(this._HashTableSize)
    }

    let ordinalTokens:StateTokenLeaf[] = splitTokens[1];
    if (ordinalTokens !== undefined) {
      for (let i:number = 0; i < ordinalTokens.length; i++) {
        this.hashTable[cat].push(
          ordinalTokens[i].name,
          ordinalTokens[i].importance,
          ordinalHash(
            ordinalTokens[i].value[0],
            ordinalTokens[i].value[1],
            ordinalTokens[i].value[2],
            this._nrBits
          )
        )
      }
    }

    let ordidTypeTokens:StateTokenLeaf[] = splitTokens[2];
    if (ordidTypeTokens !== undefined) {
      for (let i:number = 0; i < ordidTypeTokens.length; i++) {
        this.hashTable[cat].push(
          ordidTypeTokens[i].name,
          ordidTypeTokens[i].importance,
          this.getHashOfOrdinalIDTypeSelection(
            ordidTypeTokens[i].value[0],
            ordidTypeTokens[i].value[1],
            ordidTypeTokens[i].value[2],
            idtype.defaultSelectionType
          )
        )
      }
    }


    let idtypeTokens:StateTokenLeaf[] = splitTokens[3];
    if (idtypeTokens !== undefined) {
      for (let i:number = 0; i < idtypeTokens.length; i++) {
        this.hashTable[cat].push(
          idtypeTokens[i].value,
          idtypeTokens[i].importance,
          this.getHashOfIDTypeSelection(
            idtypeTokens[i].value,
            idtype.defaultSelectionType
          )
        )
      }
    }

    let regularTokens:StateTokenLeaf[] = splitTokens[0];
    if (regularTokens !== undefined) {
      for (let i:number = 0; i < regularTokens.length; i++) {
        this.hashTable[cat].push(regularTokens[i].value, regularTokens[i].importance, null)
      }
    }


    return this.hashTable[cat].toHash(this._nrBits);
  };

  public static normalizeTokenPriority(tokens:IStateToken[], baseLevel:number=1):IStateToken[] {
    let totalImportance = tokens.reduce((prev, a:IStateToken) => prev + a.importance, 0)
    for (let i:number = 0; i < tokens.length; i++) {
      tokens[i].importance = tokens[i].importance / totalImportance * baseLevel
      if (!(tokens[i] instanceof StateTokenLeaf)) {
        (<StateTokenNode>tokens[i]).childs = this.normalizeTokenPriority((<StateTokenNode>tokens[i]).childs, tokens[i].importance)
      }
    }
    return tokens
  }

  private filterLeafsAndSerialize(tokens:IStateToken[]):StateTokenLeaf[] {
    let childs:StateTokenLeaf[] = []
    for (let i = 0; i < tokens.length; i++) {
      if (tokens[i] instanceof StateTokenLeaf) {
        childs = childs.concat(<StateTokenLeaf>tokens[i])
      } else {
        childs = childs.concat(
          this.filterLeafsAndSerialize((<StateTokenNode>tokens[i]).childs)
        )
      }
    }
    return childs;
  }

}


/*export class HashColor {

  static colorMap = []
  static size:number = 0;

  public static getColor(hash:string[]):Color {
    let col = this.colorMap[String(hash)];
    if (col==null) {
      col = d3.scale.category10().range()[this.size % 10]
      this.size += 1
      this.colorMap[String(hash)] = col
    }
    return col
  }


}*/



/**
   * Calculate a 32 bit FNV-1a hash
   * Found here: https://gist.github.com/vaiorabbit/5657561
   * Ref.: http://isthe.com/chongo/tech/comp/fnv/
   *
   * @param {string} str the input value
   * @param {integer} [seed] optionally pass the hash of the previous chunk
   * @returns {integer}
   */
   function hashFnv32a(str: string, seed:number):string {
      /*jshint bitwise:false */
      var i, l,
        hval = (typeof seed != 'undefined') ? 0x811c9dc5 : seed;
      for (i = 0, l = str.length; i < l; i++) {
          hval ^= str.charCodeAt(i);
          hval += (hval << 1) + (hval << 4) + (hval << 7) + (hval << 8) + (hval << 24);
      }
      return (hval >>> 0).toString(2);
  }


    /**
   * JS Implementation of MurmurHash2
   *
   * @author <a href="mailto:gary.court@gmail.com">Gary Court</a>
   * @see http://github.com/garycourt/murmurhash-js
   * @author <a href="mailto:aappleby@gmail.com">Austin Appleby</a>
   * @see http://sites.google.com/site/murmurhash/
   *
   * @param {string} str ASCII only
   * @param {number} seed Positive integer only
   * @return {number} 32-bit positive integer hash
   */
  function murmurhash2_32_gc(str, seed) {
    var
      l = str.length,
      h = seed ^ l,
      i = 0,
      k;

    while (l >= 4) {
      k =
        ((str.charCodeAt(i) & 0xff)) |
        ((str.charCodeAt(++i) & 0xff) << 8) |
        ((str.charCodeAt(++i) & 0xff) << 16) |
        ((str.charCodeAt(++i) & 0xff) << 24);

      k = (((k & 0xffff) * 0x5bd1e995) + ((((k >>> 16) * 0x5bd1e995) & 0xffff) << 16));
      k ^= k >>> 24;
      k = (((k & 0xffff) * 0x5bd1e995) + ((((k >>> 16) * 0x5bd1e995) & 0xffff) << 16));

    h = (((h & 0xffff) * 0x5bd1e995) + ((((h >>> 16) * 0x5bd1e995) & 0xffff) << 16)) ^ k;

      l -= 4;
      ++i;
    }

    switch (l) {
    case 3: h ^= (str.charCodeAt(i + 2) & 0xff) << 16;
    case 2: h ^= (str.charCodeAt(i + 1) & 0xff) << 8;
    case 1: h ^= (str.charCodeAt(i) & 0xff);
            h = (((h & 0xffff) * 0x5bd1e995) + ((((h >>> 16) * 0x5bd1e995) & 0xffff) << 16));
    }

    h ^= h >>> 13;
    h = (((h & 0xffff) * 0x5bd1e995) + ((((h >>> 16) * 0x5bd1e995) & 0xffff) << 16));
    h ^= h >>> 15;

    return (h >>> 0).toString(2);
  }

  function ordinalHash(min:number, max:number, value:number, nrBits:number):string {
    let pct = (value-min)/(max-min)
    let minH:string = hashFnv32a(String(min), 0)
    let maxH:string = hashFnv32a(String(max), 0)
    let rng = new RNG(1);

    let hash:string = ""
    for (let i = 0; i < nrBits; i++) {
      if (rng.nextDouble() > pct) {
        hash = hash + minH.charAt(i % minH.length)
      } else {
        hash = hash + maxH.charAt(i%maxH.length)
      }
    }
    return hash;
  }

  function dec2bin(dec:number):string{
    return (dec >>> 0).toString(2);
  }


class RNG {
    private seed:number;

    constructor(seed:number) {
        this.seed = seed;
    }

    private next(min:number, max:number):number {
        max = max || 0;
        min = min || 0;

        this.seed = (this.seed * 9301 + 49297) % 233280;
        var rnd = this.seed / 233280;

        return min + rnd * (max - min);
    }

    // http://indiegamr.com/generate-repeatable-random-numbers-in-js/
    public nextInt(min:number, max:number):number {
        return Math.round(this.next(min, max));
    }

    public nextDouble():number {
        return this.next(0, 1);
    }

    public pick(collection:any[]):any {
        return collection[this.nextInt(0, collection.length - 1)];
    }
}
