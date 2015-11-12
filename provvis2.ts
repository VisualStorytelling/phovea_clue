/**
 * Created by sam on 09.02.2015.
 */
/// <reference path="../../tsd.d.ts" />

import C = require('../caleydo_core/main');
import ranges = require('../caleydo_core/range');
import idtypes = require('../caleydo_core/idtype');
import provenance = require('../caleydo_provenance/main');
import cmode = require('../caleydo_provenance/mode');
import d3 = require('d3');
import vis = require('../caleydo_core/vis');

function translate(x = 0, y = 0) {
  return 'translate(' + (x || 0) + ',' + (y || 0) + ')';
}


class StateRepr {
  doi: number;
  xy: [number, number] = [0,0];

  selected = false;
  parent: StateRepr = null;
  children: StateRepr[] = [];

  constructor(public s: provenance.StateNode) {
    this.doi = 0.1;
  }

  build(lookup: { [id:number] :StateRepr }) {
    const p = this.s.previousState;
    if (p) {
      this.parent = lookup[p.id];
      this.parent.children.push(this);
    }
  }

  get flatChildren() {
    var r = this.children.slice();
    this.children.forEach((c) => r.push.apply(r, c.flatChildren));
    return r;
  }

  get cx() {
    return this.xy[0] + this.size[0]*0.5;
  }

  get cy() {
    return this.xy[1] + this.size[1]*0.5;
  }

  get size() {
    if (this.doi === 1.0) {
      return [50,50];
    } else if (this.doi >= 0.8) {
      return [50, 50];
    } else if (this.doi >= 0.5) {
      return [20,20];
    } else {
      return  [10,10];
    }
  }

  static toRepr(graph : provenance.ProvenanceGraph) {
    //assign doi
    const maxDoI = 1;
    const lookup : any = {};
    const states = graph.states.map((s) => {
      var r = new StateRepr(s);
      lookup[s.id] = r;
      return r;
    });
    //build tree
    states.forEach((s) => s.build(lookup));

    //mark selected
    const selected = graph.act;
    lookup[selected.id].selected = true;

    //route to path = 1
    const line = selected.path.map((p) => {
      const r = lookup[p.id];
      r.doi = maxDoI;
      return r;
    });

    this.layout(states, line);

    return states;
  }

  private static layout(states: StateRepr[], line: StateRepr[]) {
    //horizontally align the line
    var byLevel : StateRepr[][] = [];
    const root = states.filter((s) => s.parent === null)[0];
    byLevel.push([root]);
    byLevel.push(root.children);

    while(byLevel[byLevel.length-1].length > 0) {
      byLevel.push([].concat.apply([],byLevel[byLevel.length - 1].map((c) => c.children)));
    }
    byLevel.forEach((level,i) => {
      if (i < line.length) {
        //resort such that the element will be at the first place
        level.splice(level.indexOf(line[i]),1);
        level.unshift(line[i]);
      }
    });

    byLevel.forEach((level, i) => {
      //ensure that my children have at least a >= index than me
      level.forEach((s,j) => {
        if (s) {
          s.xy = [j,i];
          if (s.children.length > 0) {
            var start = byLevel[i+1].indexOf(s.children[0]);
            while(start < j) {
              byLevel[i+1].splice(start,0, null);
              start += 1;
            }
          }
        }
      });
    });

    //we have a bread first with the line at the first position

    //align all columns by their max width
    const colwidths = [], rowheights = [];
    states.forEach((s) => {
      colwidths[s.xy[0]] = Math.max(colwidths[s.xy[0]] || 0, s.size[0]);
      rowheights[s.xy[1]] = Math.max(rowheights[s.xy[1]] || 0, s.size[1]);
    });

    //convert indices to real positions
    const acccolwidths = colwidths.reduce((arr, b) => {
        arr.push(arr[arr.length - 1] + b);
        return arr;
      }, [0]),
      accrowheights = rowheights.reduce((arr, b) => {
        arr.push(arr[arr.length - 1] + b);
        return arr;
      }, [0]);
    acccolwidths.shift();

    states.forEach((s) => {
      const size = s.size;
      const xy = s.xy;
      const x = acccolwidths[acccolwidths.length-1] -acccolwidths[xy[0]] + (colwidths[xy[0]] - size[0]) * 0.5;
      const y = accrowheights[xy[1]] + (rowheights[xy[1]] - size[1]) * 0.5;
      s.xy = [x,y];
    });
  }

  static render($elem: d3.Selection<StateRepr>) {
    $elem
      .classed('small', (d) => d.doi < 0.5)
      .classed('round', (d) => d.doi <= 0.8)
      .classed('full', (d) => d.doi >= 1)
      .classed('select-selected', (d) => d.selected);
    $elem.select('span.slabel').text((d) => d.s.name);
    $elem.select('div.sthumbnail')
      .style('background-image', (d) => d.doi >= 1.0 ? 'url(todo.png)' : null);

    $elem.transition().style({
      left: (d) => d.xy[0]+'px',
      top: (d) => d.xy[1]+'px'
    });
  }
}

export class LayoutedProvVis extends vis.AVisInstance implements vis.IVisInstance {
  private $node:d3.Selection<any>;
  private trigger = C.bind(this.update, this);
  private onStateAdded = (event:any, state:provenance.StateNode) => {
    state.on('setAttr', this.trigger);
  };
  private onSelectionChanged = (event: any, type: string, act: ranges.Range) => {
    const selectedStates = act.dim(<number>provenance.ProvenanceGraphDim.State).filter(this.data.states);
    this.$node.selectAll('div.state').classed('select-'+type,(d: StateRepr) => selectedStates.indexOf(d.s) >= 0);
  };

  private line = d3.svg.line<{ cx: number; cy : number}>().interpolate('step-after').x((d) => d.cx).y((d) => d.cy);

  constructor(public data:provenance.ProvenanceGraph, public parent:Element, private options:any) {
    super();
    this.options = C.mixin({}, options);
    this.options.scale = [1, 1];
    this.options.rotate = 0;
    this.$node = this.build(d3.select(parent));
    C.onDOMNodeRemoved(this.node, this.destroy, this);

    this.bind();
    this.update();
  }

  get width() {
    return 300;
  }

  private bind() {
    this.data.on('switch_state,clear', this.trigger);
    this.data.on('add_state', this.onStateAdded);
    this.data.on('select', this.onSelectionChanged);
    this.data.states.forEach((s) => {
      s.on('setAttr', this.trigger);
    });
    cmode.on('modeChanged', this.trigger);
  }

  destroy() {
    super.destroy();
    this.data.off('switch_state,clear', this.trigger);
    this.data.off('add_state', this.onStateAdded);
    this.data.off('select', this.onSelectionChanged);
    this.data.states.forEach((s) => {
      s.off('setAttr', this.trigger);
    });
    cmode.off('modeChanged', this.trigger);
  }

  get rawSize():[number, number] {
    return [this.width, 500];
  }

  get node() {
    return <Element>this.$node.node();
  }

  option(name:string, val?:any) {
    if (arguments.length === 1) {
      return this.options[name];
    } else {
      this.fire('option.' + name, val, this.options[name]);
      this.options[name] = val;

    }
  }

  locateImpl(range:ranges.Range) {
    return Promise.resolve(null);
  }

  transform(scale?:number[], rotate:number = 0) {
    var bak = {
      scale: this.options.scale || [1, 1],
      rotate: this.options.rotate || 0
    };
    if (arguments.length === 0) {
      return bak;
    }
    var dims = this.data.dim;
    var width = 20, height = dims[0];
    this.$node.attr({
      width: width * scale[0],
      height: height * scale[1]
    }).style('transform', 'rotate(' + rotate + 'deg)');
    //this.$node.select('g').attr('transform', 'scale(' + scale[0] + ',' + scale[1] + ')');
    var new_ = {
      scale: scale,
      rotate: rotate
    };
    this.fire('transform', new_, bak);
    this.options.scale = scale;
    this.options.rotate = rotate;
    return new_;
  }


  private build($parent:d3.Selection<any>) {
    var size = this.size;
    //  scale = this.options.scale;
    var $svg = $parent.append('div').attr({
      'class': 'provenance-layout-vis'
    }).style('transform', 'rotate(' + this.options.rotate + 'deg)');

    $svg.append('svg');
    $svg.append('div');

    return $svg;
  }

  private onStateClick(d: StateRepr) {
    d3.event.stopPropagation();
    this.data.selectState(d.s, idtypes.toSelectOperation(d3.event));
    this.data.jumpTo(d.s);
  }

  update() {
    const graph = this.data;


    const states = StateRepr.toRepr(graph);
    const $states = this.$node.select('div').selectAll('div.state').data(states, (d) => ''+d.s.id);
    const $states_enter = $states.enter().append('div')
      .classed('state', true)
      .attr('data-id', (d) => d.s.id)
      .on('click', this.onStateClick.bind(this))
      .on('mouseenter', (d) => graph.selectState(d.s, idtypes.SelectOperation.SET, idtypes.hoverSelectionType))
      .on('mouseleave', (d) => graph.selectState(d.s, idtypes.SelectOperation.REMOVE, idtypes.hoverSelectionType))
      .attr('draggable',true)
      .on('dragstart', (d) => {
        const e = <DragEvent>(<any>d3.event);
        e.dataTransfer.effectAllowed = 'copy'; //none, copy, copyLink, copyMove, link, linkMove, move, all
        e.dataTransfer.setData('text/plain', d.s.name);
        e.dataTransfer.setData('application/caleydo-prov-state',String(d.s.id));
      });

    $states_enter.append('div').classed('sthumbnail', true);
    $states_enter.append('span').classed('slabel',true).on('click', (d) => {
      d.s.name = prompt('Comment', d.s.name);
      d3.event.stopPropagation();
      d3.event.preventDefault();
    });

    $states.call(StateRepr.render);

    $states.exit().remove();

    var edges = [];
    states.forEach((s) => {
      edges.push.apply(edges, s.children.map((c) => ({s : s, t : c})));
    });

    this.$node.select('svg')
      .attr('width', d3.max(states, (s) => s.xy[0]+s.size[0]))
      .attr('height', d3.max(states, (s) => s.xy[1]+s.size[1]));

    const $edges = this.$node.select('svg').selectAll('path').data(edges, (d) => d.s.s.id+'-'+d.t.s.id);
    $edges.enter().append('path');
    $edges.transition().attr('d', (d) => this.line([d.s, d.t]));

  }
}

export function create(data:provenance.ProvenanceGraph, parent:Element, options = {}) {
  return new LayoutedProvVis(data, parent, options);
}
