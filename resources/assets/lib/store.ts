/**
 *    Copyright (c) ppy Pty Ltd <contact@ppy.sh>.
 *
 *    This file is part of osu!web. osu!web is distributed with the hope of
 *    attracting more community contributions to the core ecosystem of osu!.
 *
 *    osu!web is free software: you can redistribute it and/or modify
 *    it under the terms of the Affero GNU General Public License version 3
 *    as published by the Free Software Foundation.
 *
 *    osu!web is distributed WITHOUT ANY WARRANTY; without even the implied
 *    warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
 *    See the GNU Affero General Public License for more details.
 *
 *    You should have received a copy of the GNU Affero General Public License
 *    along with osu!web.  If not, see <http://www.gnu.org/licenses/>.
 */

import Shopify from 'shopify-buy';
import { toShopifyVariantId } from 'shopify-gid';

declare global {
  interface Window {
    Store: Store;
  }
}

// process.env.$ has to be static as it is injected by webpack at compile time.
const options = {
  domain: process.env.SHOPIFY_DOMAIN,
  storefrontAccessToken: process.env.SHOPIFY_TOKEN,
};

const client = Shopify.buildClient(options);

interface LineItem {
  quantity: number;
  variantId: string;
}

export class Store {
  private static instance: Store;

  static init() {
    if (this.instance == null) {
      this.instance = new Store();
    }

    return this.instance;
  }

  private constructor() {
    $(document).on('click', '.js-store-checkout', this.beginCheckout.bind(this));
    $(document).on('click', '.js-store-shopify-checkout', this.resumeShopifyCheckout.bind(this));
  }

  async beginCheckout(event: Event) {
    if (event.target == null) { return event.preventDefault(); }

    const orderId = osu.presence((event.target as HTMLElement).dataset.orderId);
    if (orderId == null) {
      throw new Error('orderId is missing');
    }

    const { isValid, lineItems } = this.collectShopifyItems();

    if (!isValid) {
      // can't mix Shopify and non-Shopify items.
      osu.popup('These items can\'t be checked out together', 'danger');

      return event.preventDefault();
    }

    if (lineItems.length > 0) {
      event.preventDefault();
      return this.beginShopifyCheckout(orderId, lineItems);
    }
  }

  async beginShopifyCheckout(orderId: string, lineItems: LineItem[]) {
    try {
      LoadingOverlay.show();
      LoadingOverlay.show.flush();

      // create shopify checkout.
      // error returned will be a JSON string in error.message
      const checkout = await client.checkout.create({
        customAttributes: [{ key: 'orderId', value: orderId }],
        lineItems,
      });

      const params = {
        orderId,
        provider: 'shopify',
        shopifyId: checkout.id,
      };

      await osu.promisify($.post(laroute.route('store.checkout.store'), params));

      window.location = checkout.webUrl;
    } catch (error) {
      osu.popup('TODO: handle different error messages', 'danger');
      LoadingOverlay.hide();
    }
  }

  async resumeShopifyCheckout(event: Event) {
    event.preventDefault();
    if (event.target == null) { return; }

    LoadingOverlay.show();
    LoadingOverlay.show.flush();

    const checkoutId = osu.presence((event.target as HTMLElement).dataset.checkoutId);
    const checkout = await client.checkout.fetch(checkoutId);

    window.location = checkout.webUrl;
  }

  private collectShopifyItems() {
    let isValid = true;

    const lineItems: LineItem[] = [];
    $('.js-store-order-item').each((_, element) => {
      const id = osu.presence(element.dataset.shopifyId);
      if (id == null) {
        isValid = false;
      }

      if (id != null) {
        lineItems.push({
          quantity: Number(element.dataset.quantity),
          variantId: toShopifyVariantId(id),
        });
      }
    });

    if (lineItems.length === 0) {
      isValid = true;
    }

    return {
      isValid,
      lineItems,
    };
  }
}

window.Store = window.Store || Store.init();
