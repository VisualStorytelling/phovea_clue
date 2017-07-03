/**
 * Created by Holger Stitz on 07.06.2017.
 */
import {IVisState} from 'phovea_core/src/provenance/retrieval/VisState';
import {IPropertyValue} from 'phovea_core/src/provenance/retrieval/VisStateProperty';
import {COMPARATORS, selectComparator} from './VisStatePropertyComparator';

export interface IQuery {
  propValues: IPropertyValue[];
  weights: number[];

  addPropValue(propValue:IPropertyValue):IQuery;
  removePropValue(propValue:IPropertyValue):IQuery;
}

export interface ISearchResult {
  query: IQuery;
  state: IVisState;
  similarity: number;
}

export class Query implements IQuery {

  private _propValues:IPropertyValue[] = [];
  private _weights:number[] = [];

  constructor() {
    //
  }

  get propValues():IPropertyValue[] {
    return this._propValues;
  }

  get weights():number[] {
    return this._weights;
  }

  addPropValue(propValue:IPropertyValue):IQuery {
    const q = new Query();
    q._propValues = [].concat(this.propValues, propValue);
    return q;
  }

  removePropValue(propValue:IPropertyValue):IQuery {
    const q = new Query();
    q._propValues = this.propValues.filter((d) => d !== propValue);
    return q;
  }

}

export class VisStateIndex {

  states: IVisState[] = [];

  constructor() {
    //
  }

  addState(state: IVisState) {
    if(this.states.indexOf(state) > -1) {
      return false;
    }

    this.states = [...this.states, state];

    COMPARATORS.forEach((c) => {
      c.addState(state);
    });

    return true;
  }

  compareAll(query:IQuery):ISearchResult[] {
    return this.states.map((s) => VisStateIndex.compare(query, s));
  }

  static compare(query:IQuery, state: IVisState):ISearchResult {
    return <ISearchResult>{
      query,
      state,
      similarity: state.compare(selectComparator, query.propValues)
    };
  }

}