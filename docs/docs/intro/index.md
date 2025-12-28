---
slug: /intro
sidebar_position: 1
title: Introduction
---

# P2P Lending Platform Documentation

Welcome to the **P2P Lending Platform** developer hub. This documentation provides everything you need to understand, integrate, and operate our Peer-to-Peer lending system.

## What is P2P Lending?

Our platform connects **Investors** (Lenders) directly with **Borrowers**, eliminating traditional banking intermediaries. We leverage blockchain technology for transparency and a core banking engine (Fineract) for financial precision.

:::tip Key Value Proposition
*   **Transparency**: Every loan entry is audited on Hyperledger Fabric.
*   **Automation**: Smart matching and auto-disbursement.
*   **Trust**: Funds are held in escrow until fully matched.
:::

## Documentation Structure

We have organized our documentation to help you find exactly what you need:

<div className="row">
  <div className="col col--4">
    <div className="card">
      <div className="card__header">
        <h3>💡 Concepts</h3>
      </div>
      <div className="card__body">
        <p>
          Understand the theory behind the platform, including the <strong>Money Flow</strong> and <strong>Escrow Model</strong>.
        </p>
      </div>
      <div className="card__footer">
        <a href="/docs/concepts/money-flow" className="button button--secondary button--block">Learn Concepts</a>
      </div>
    </div>
  </div>

  <div className="col col--4">
    <div className="card">
      <div className="card__header">
        <h3>📘 Guides</h3>
      </div>
      <div className="card__body">
        <p>
          Step-by-step instructions for <strong>Investing</strong>, <strong>Borrowing</strong>, and performing <strong>Reconciliation</strong>.
        </p>
      </div>
      <div className="card__footer">
        <a href="/docs/guides/lending/invest" className="button button--secondary button--block">Read Guides</a>
      </div>
    </div>
  </div>

  <div className="col col--4">
    <div className="card">
      <div className="card__header">
        <h3>⚙️ Integration</h3>
      </div>
      <div className="card__body">
        <p>
          Deep dive into the <strong>Fineract Core</strong> and <strong>Blockchain</strong> integration details.
        </p>
      </div>
      <div className="card__footer">
        <button className="button button--secondary button--block" disabled>Coming Soon</button>
      </div>
    </div>
  </div>
</div>

<br/>

## Technology Stack

The platform is built on a modern, robust stack designed for financial security. For a deep dive, see **[Technology Stack](/docs/intro/tech-stack)**.

| Component | Technology | Role |
|-----------|------------|------|
| **Core Banking** | Apache Fineract | Account management, Ledger, Interest calculation. |
| **Blockchain** | Hyperledger Fabric | Audit trail, Immutable record of Loan Contracts. |
| **Backend** | NestJS (Node.js) | Orchestrator, Business Logic, API Gateway. |
| **Database** | MongoDB | Fast path data storage, Transaction Logging. |
| **Frontend** | React Native (Expo) | Cross-platform mobile application. |

## Getting Started

Ready to build? Check out the **[Money Flow](/docs/concepts/money-flow)** to understand the lifecycle of a loan, or jump straight into the **[Reconciliation Guide](/docs/guides/operations/reconciliation)** to see how we track funds.
