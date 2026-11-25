import { Component } from '@angular/core';
@Component({
  selector: 'app-brand',
  template: `<div class="brand">
    <img src="assets/brand/usco-ocre.png" alt="Universidad Surcolombiana" width="347" height="90" /><span
      >TutoLink</span
    >
  </div>`,
  styles: [
    `
      :host {
        display: block;
      }
      .brand {
        max-width: 960px;
        margin: auto;
        padding: 16px 20px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
      }
      img {
        display: block;
        width: clamp(172px, 47vw, 235px);
        height: auto;
        flex-shrink: 0;
      }
      span {
        color: var(--ion-color-secondary);
        font-size: 17px;
        font-weight: 600;
        border-left: 1px solid #dfd4a680;
        padding-left: 16px;
      }
      @media (max-width: 359px) {
        .brand {
          padding-inline: 16px;
          gap: 10px;
        }
        span {
          font-size: 15px;
          padding-left: 10px;
        }
      }
    `,
  ],
})
export class BrandComponent {}
