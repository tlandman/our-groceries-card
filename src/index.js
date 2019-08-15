import '@babel/polyfill/noConflict';

import { LitElement, html } from 'lit-element';
import style from './style';

import defaultConfig from './defaults';

// import TravelTimeEditor from './index-editor';
// customElements.define('travel-time-card-editor', TravelTimeEditor);


class OurGroceriesCard extends LitElement {
  static get properties() {
    return {
      hass: Object,
      config: Object,
      openedLists: Object,
    };
  }

  constructor() {
    super();
    this.openedLists = {};
    this.listItems = {};
    this.showAddItems = {};
  }

  // static async getConfigElement() {
  //   return document.createElement("travel-time-card-editor");
  // }

  setConfig(config) {
    this.config = {
      ...defaultConfig,
      ...config,
    };

    this.baseApiUrl = `ourgroceries`;
  }

  /**
   * get the current size of the card
   * @return {Number}
   */
  getCardSize() {
    return 5;
  }

  static get styles() {
    return style;
  }

  /**
   * generates the card HTML
   * @return {TemplateResult}
   */
  render() {
    this.entity = this.hass.states[this.config.entity];
    if (!this.entity) {
      throw new Error(`Our Groceries sensor not found.`);
    }

    return html`
      <ha-card class='our-groceries-card'>
        <style>${OurGroceriesCard.styles}</style>
        ${this.config.show_header ? 
          html`
            <div class='header'>
              ${this.config.title}
            </div>
          ` 
          : null
        }
        <div class='body'>
          ${this.renderBody()}
        </div>
      </ha-card>
    `;
  }

  /**
   * Opens a list's details
   * @param {} list
   */
  async openList(list) {

    // if list is already open then just close it
    const isOpen = this.openedLists[list.id];
    if(isOpen){
      this.openedLists[list.id] = false;
      this.openedLists = { ...this.openedLists};
      return;
    }

    await this.getListItems(list.id);
  }

  /**
   * gets a list's items and saves in listItems property to trigger redraw
   */
  async getListItems(listId){
    try {
      const list_details = await this.hass.callApi('post', this.baseApiUrl, {
        command: 'get_list_items',
        list_id: listId
      });

      this.listItems[listId] = list_details.list;
      this.openedLists[listId] = true;
      this.openedLists = { ...this.openedLists };

    } catch (error) {
      console.error({ error })
    }
  }

  toggleNewItem(event, listId){
    if (!this.showAddItems[listId]) this.showAddItems[listId] = {};

    const newItem = this.showAddItems[listId];
    newItem.show = !newItem.show;

    if (!newItem.show){
      this.showAddItems[listId] = null;
    }
    this.performUpdate();
  }

  updateNewItem(event, listId) {
    const newItem = this.showAddItems[listId];
    newItem.value = event.target.value;
  }

  async addNewItem({key}, listId) {
    if (key !== 'Enter') return;

    const newItem = { ...this.showAddItems[listId] };
    this.performUpdate();

    try {
      await this.hass.callApi('post', this.baseApiUrl, {
        command: 'add_item_to_list',
        list_id: listId,
        value: newItem.value,
      });

      // after adding reset new item, 
      this.showAddItems[listId] = {};

      // if list open then refresh list else just force card update
      const isOpen = this.openedLists[listId];
      if (isOpen){
        await this.getListItems(listId);
      } else {
        this.performUpdate();
      }

    } catch (error) {
      console.error({ error })
    }
  }

  /**
   * generates the card body
   * @return {TemplateResult}
   */
  renderBody() {
    const body = (this.entity.attributes.shopping_lists || []).map(list => {
      const isOpen = this.openedLists[list.id];
      const listDetails = isOpen && this.listItems[list.id];
      const addingItem = (this.showAddItems[list.id] || {});

      return html`
        <tr>
          <td class='td td-name pointer'>
            <ha-icon icon="mdi:plus" @click="${event => this.toggleNewItem(event, list.id)}"></ha-icon>
            <span @click=${() => this.openList(list)}>${list.name}</span>
          </td>
          <td class='td td-count'>
            ${list.activeCount} 
          </td>
        <tr>
        ${addingItem.show ? this.renderNewItem(addingItem, list): null}
        <tr>
          ${isOpen && listDetails ? this.renderList(listDetails) : null}
        </tr>
      `;
    });

    return html`
      <table>
        ${this.renderBodyHeader()}
        <tbody>
          ${body}
        </tbody>
      </table>
    `;
  }

  renderNewItem(addingItem, list) {
    return html`
      <tr>
        <td class='td new-item'>
          <paper-input
            label="New Item"
            .value="${addingItem.value}"
            @keypress=${event => this.addNewItem(event, list.id)}
            @value-changed="${event => this.updateNewItem(event, list.id)}"
          ></paper-input>
          <ha-icon 
            icon="mdi:file-send" 
            class='add-item pointer'
            @click="${() => this.addNewItem({ key: 'Enter'}, list.id)}"
          ></ha-icon>
        </td>
      <tr>`
  }

  /**
   * 
   * @param {OgList} listDetails 
   */
  renderList(listDetails){

    // sort by active and crossed off items
    const items = listDetails.items.reduce((acc, curr) => {
      const list = curr.crossedOff ? acc.crossedOff : acc.active;
      list.push(curr);
      return acc;
    },{active: [], crossedOff: []});

    return html`
      <td colspan='2'>
        <ul>
          ${items.active.map(item => this.renderListItem(item, listDetails.id))}
        </ul>
        <ul>
          ${items.crossedOff.map(item => this.renderListItem(item, listDetails.id))}
        </ul>
      </td>
    `
  }

  /**
   * 
   * @param {OgListItem} item 
   */
  renderListItem(item, listId){
    return html`
      <li 
        class="pointer ${item.crossedOff ? 'crossed-off' : ''}"
        .itemId=${item.id} 
        .crossedOff=${item.crossedOff} 
      >
        <div @click=${() => this.toggleItem(listId, item.id, !item.crossedOff)}>${item.value}</div>
        <ha-icon icon="mdi:delete" @click="${() => this.removeItem(listId, item.id)}"></ha-icon>
      </li>
    `;
  }

  async removeItem(listId, itemId){
    try {
      await this.hass.callApi('post', this.baseApiUrl, {
        command: 'remove_item_from_list',
        list_id: listId,
        item_id: itemId,
      });

      // list had to be open to delete item so refresh list
      await this.getListItems(listId);

    } catch (error) {
      console.error({ error })
    }
  }

  /**
   * togles an item's crossedOff property
   * @param {string} listId 
   * @param {string} itemId 
   * @param {boolean} crossedOff 
   */
  async toggleItem(listId, itemId, crossedOff) {
    try {
      await this.hass.callApi('post', this.baseApiUrl, {
        command: 'toggle_item_crossed_off', 
        list_id: listId,
        item_id: itemId,
        cross_off: crossedOff
      });

      await this.getListItems(listId);

    } catch(error){
      console.error({ error });
    }
  }

  async refeshLists(){

  }

  /**
   * generates the card body header
   * @return {TemplateResult}
   */
  renderBodyHeader() {
    return html`
      <thead>
        <tr>
          <th>Shopping Lists</th>
          <th># Items</th>
        </tr>
      <thead>
    `;
  }
}

customElements.define('our-groceries-card', OurGroceriesCard);


