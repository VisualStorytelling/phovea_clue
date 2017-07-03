/**
 * Created by Holger Stitz on 01.06.2017.
 */
import * as d3 from 'd3';
import ProvenanceGraph from 'phovea_core/src/provenance/ProvenanceGraph';
import {AVisInstance, IVisInstance} from 'phovea_core/src/vis';
import {onDOMNodeRemoved, mixin} from 'phovea_core/src/index';
import StateNode from 'phovea_core/src/provenance/StateNode';
import * as idtypes from 'phovea_core/src/idtype';
import {Select2} from './Select2';
import {IQuery, ISearchResult, Query, VisStateIndex} from './VisStateIndex';
import ActionNode from 'phovea_core/src/provenance/ActionNode';
import {IPropertyValue} from 'phovea_core/src/provenance/retrieval/VisStateProperty';


/**
 * To enable the Provenance Retrieval Panel the application must set to the ACLUEWrapper.
 *
 * ```
 * const elems = template.create(document.body, { ... });
 * elems.graph.then((graph) => {
 *   const app = gapminder.create(<Element>elems.$main.node(), graph);
 *   elems.setApplication(app); // set application to enable provenance retrieval
 *   // ...
 * });
 * ```
 */
export class ProvRetrievalPanel extends AVisInstance implements IVisInstance {

  /**
   * Capture the `StateNode.visState` that haven not been persisted yet and index them.
   *
   * NOTE:
   * In order to capture a StateNode the application must jump to each state and capture it.
   * Depending on the machine and number of states that might results in long loading times.
   *
   * @type {boolean}
   */
  private static CAPTURE_AND_INDEX_NON_PERSISTED_STATES = true;

  private executedFirstListner = ((evt:any, action:ActionNode, state:StateNode) => {
    const success = this.captureAndIndexState(state);
    if(success) {
      this.performSearch(this.query);
    }
  });

  private $node: d3.Selection<any>;
  private $searchResults: d3.Selection<any>;

  private dim: [number, number] = [200, 100];

  private stateIndex:VisStateIndex = new VisStateIndex();

  private query:IQuery = new Query();

  constructor(public data: ProvenanceGraph, public parent: Element, private options: any) {
    super();
    this.options = mixin({}, options);
    this.$node = this.build(d3.select(parent));
    onDOMNodeRemoved(this.node, this.destroy, this);

    this.bind();
    this.initStateIndex(this.data.states, ProvRetrievalPanel.CAPTURE_AND_INDEX_NON_PERSISTED_STATES);
  }

  private bind() {
    this.data.on('executed_first', this.executedFirstListner);
  }

  destroy() {
    super.destroy();
    this.data.off('executed_first', this.executedFirstListner);
  }

  get rawSize(): [number, number] {
    return this.dim;
  }

  get node() {
    return <Element>this.$node.node();
  }

  /**
   * Build the index of given StateNodes for later retrieval.
   * The flag determines how to handle states that do not contain a valid visState.
   *
   * @param stateNodes List of StateNodes that should be indexed
   * @param captureAndIndex Capture and index *non-persisted* states?
   */
  private initStateIndex(stateNodes:StateNode[], captureAndIndex:boolean) {
    // already persisted states have to be added to the index only
    stateNodes
      .filter((stateNode) => stateNode.visState.isPersisted())
      .forEach((stateNode) => {
        //console.log('already persisted', stateNode.name, stateNode.visState.isPersisted());
        this.stateIndex.addState(stateNode.visState);
      });

    const nonPersistedStates = stateNodes.filter((stateNode) => !stateNode.visState.isPersisted());

    if(nonPersistedStates.length > 0) {
      if(captureAndIndex) {
        this.jumpToAndIndexStates(nonPersistedStates);

      } else {
        console.warn(`${nonPersistedStates.length} provenance states were not indexed for the provenance state search. You will get incomplete search results.`);
      }
    }
  }

  /**
   * Iterates asynchronously over all states, jumps to them, captures the visState and indexes them.
   * @param stateNodes
   * @returns {Promise<any>} Will be resolved, once all states are processed.
   */
  private async jumpToAndIndexStates(stateNodes:StateNode[]):Promise<any> {
    const currentState = this.data.act;

    for (const stateNode of stateNodes) {
      await this.data.jumpTo(stateNode);
      this.captureAndIndexState(stateNode);
      //console.log('newly persisted', stateNode.name, stateNode.visState.terms);
    }

    return this.data.jumpTo(currentState); // jump back to previous state
  }

  /**
   * Captures the visState of a node and adds it to the index
   * @param stateNode
   * @returns {boolean} Returns `true` if successfully added to index. Otherwise returns `false`.
   */
  private captureAndIndexState(stateNode:StateNode):boolean {
    stateNode.visState.captureAndPersist();
    return this.stateIndex.addState(stateNode.visState);
  }

  private build($parent: d3.Selection<any>) {
    const $p = $parent.append('aside')
      .classed('provenance-layout-vis', true)
      .classed('prov-retrieval-panel', true)
      .style('transform', 'rotate(' + this.options.rotate + 'deg)');

    $p.html(`
      <div class="header">
        <h2><i class="fa fa-search"></i> Search Provenance States</h2>
      </div>
      <div class="body">
        <form action="#" onsubmit="return false; ">
          <div class="form-group">
            <label class="sr-only" for="prov-retrieval-select">Filter provenance states by &hellip;</label>
            <select multiple="multiple" style="width: 100%" class="form-control hidden" id="prov-retrieval-select"></select>
          </div>
        </form>
        <ol class="search-results"></ol>
        <p>No matching states found.</p>
      </div>
    `);

    this.$searchResults = $p.select('.search-results');

    if(this.options.app && this.options.app.getVisStateProps) {
      this.options.app.getVisStateProps().then((properties) => {
        const $s2Instance = new Select2();
        const $select2 = $s2Instance.init('#prov-retrieval-select', properties);
        $select2
          .on('select2:select', (evt) => {
            const propValue:IPropertyValue = evt.params.data.propValue;
            propValue.isSelected = true;
            //console.log('select2:select', evt.params.data);

            this.query = this.query.addPropValue(propValue);
            this.performSearch(this.query);
          })
          .on('select2:unselect', (evt) => {
            const propValue:IPropertyValue = evt.params.data.propValue;
            propValue.isSelected = false;
            //console.log('select2:unselect ', evt.params.data);

            this.query = this.query.removePropValue(propValue);
            this.performSearch(this.query);

            // close drop down on unselect (see https://github.com/select2/select2/issues/3209#issuecomment-149663474)
            if (!evt.params.originalEvent) {
              return;
            }
            evt.params.originalEvent.stopPropagation();
          });
      });

    } else {
      $p.select('.body > form').classed('hidden', true);
    }

    return $p;
  }

  private performSearch(query:IQuery) {
    if(!query) {
      return;
    }

    const results:ISearchResult[] = this.stateIndex
      .compareAll(query)
      .filter((state) => state.similarity > 0);

    this.updateResults(results);
  }

  private updateResults(results:ISearchResult[]) {

    this.$searchResults.selectAll('*').remove(); // clear DOM list

    if(results.length === 0) {
      return;
    }

    const data = results
      .sort((x, y) => y.similarity - x.similarity)
      .map((d) => {
        (<any>d).terms = d.state.propValues.map((propValue) => {
          return (d.query.propValues.filter((d) => d.id === propValue.id).length > 0) ? `<span class="match">${propValue.text}</span>` : `${propValue.text}`;
        });
        return d;
      });

    const $li = this.$searchResults.selectAll('li').data(data);

    $li.enter().append('li');

    $li
      .html((d) => `
        <span class="title">${(<StateNode>d.state.node).name}</span>
        <span class="label score">${d.similarity.toFixed(2)} </span>
        <small class="terms">${(<any>d).terms.join(', ')}</small>
      `)
      .on('mouseenter', (d) => {
        (<Event>d3.event).stopPropagation();
        this.data.selectState(<StateNode>d.state.node, idtypes.SelectOperation.SET, idtypes.hoverSelectionType);
      })
      .on('mouseleave', (d) => {
        (<Event>d3.event).stopPropagation();
        this.data.selectState(<StateNode>d.state.node, idtypes.SelectOperation.REMOVE, idtypes.hoverSelectionType);
      })
      .on('click', (d) => {
        (<Event>d3.event).stopPropagation();
        this.data.selectState(<StateNode>d.state.node, idtypes.toSelectOperation(<MouseEvent>d3.event));
        this.data.jumpTo(<StateNode>d.state.node);
      });

    $li.exit().remove();

  }

}

export function create(data: ProvenanceGraph, parent: Element, options = {}) {
  return new ProvRetrievalPanel(data, parent, options);
}