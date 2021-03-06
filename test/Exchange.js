const { expect } = require('chai');
const { ethers } = require('hardhat');

const tokens = (n) => {
  return ethers.utils.parseUnits(n.toString(), 'ether')
}

describe('Exchange', () => {
  let deployer, feeAccount, exchange

  const feePercent = 10

  beforeEach(async () => {
    const Exchange = await ethers.getContractFactory('Exchange')
    const Token = await ethers.getContractFactory('Token')

    token1 = await Token.deploy('Cryptoker', 'CTOKE', '1000000')
    token2 = await Token.deploy('Mock DAI', 'mDAI', '1000000')

    accounts = await ethers.getSigners()
    deployer = accounts[0]
    feeAccount = accounts[1]
    user1 = accounts[2]
    user2 = accounts[3]

    let tx = await token1.connect(deployer).transfer(user1.address, tokens(100))
    
    exchange = await Exchange.deploy(feeAccount.address, feePercent)
  })

  describe('Deployment', () => {
    const name = 'Cryptoker'
    const symbol = 'CTOKE'
    const decimals = '18'
    const totalSupply = tokens('1000000')

    it('tracks the fee account', async () => {
      expect(await exchange.feeAccount()).to.equal(feeAccount.address)
    })

    it('tracks the fee percent', async () => {
      expect(await exchange.feePercent()).to.equal(feePercent)
    })
  })

  describe('Depositing Tokens', () => {
    let tx, result
    let amount = tokens(10)

    describe('Success', () => {
      beforeEach(async () => {
      tx = await token1.connect(user1).approve(exchange.address, amount)
      result = await tx.wait()

      tx = await exchange.connect(user1).depositToken(token1.address, amount)
      result = await tx.wait()
      })

        it('tracks the token deposit', async () => {
          expect(await token1.balanceOf(exchange.address)).to.equal(amount)
          expect(await exchange.tokens(token1.address, user1.address)).to.equal(amount)
          expect(await exchange.balanceOf(token1.address, user1.address)).to.equal(amount)
        })

        it('emits a deposit event', async () => {
          const event = result.events[1]
          expect(event.event).to.equal('Deposit')

          const args = event.args
          expect(args.token).to.equal(token1.address)
          expect(args.user).to.equal(user1.address)
          expect(args.amount).to.equal(amount)
          expect(args.balance).to.equal(amount)
      })
    })

    describe('Failure', () => {
      it('fails when no tokens are approved', async () => {
        await expect(exchange.connect(user1).depositToken(token1.address, amount)).to.be.reverted
      })
    })

  })

  describe('Withdrawing Tokens', () => {
    let tx, result
    let amount = tokens(10)

    describe('Success', () => {
      beforeEach(async () => {

      tx = await token1.connect(user1).approve(exchange.address, amount)
      result = await tx.wait()

      tx = await exchange.connect(user1).depositToken(token1.address, amount)
      result = await tx.wait()

      tx = await exchange.connect(user1).withdrawToken(token1.address, amount)
      result = await tx.wait()
      })

        it('withdraws the token funds', async () => {
          expect(await token1.balanceOf(exchange.address)).to.equal(0)
          expect(await exchange.tokens(token1.address, user1.address)).to.equal(0)
          expect(await exchange.balanceOf(token1.address, user1.address)).to.equal(0)
        })

        it('emits a Withdraw event', async () => {
        const event = result.events[1] // 2 events are emitted
        expect(event.event).to.equal('Withdraw')

        const args = event.args
        expect(args.token).to.equal(token1.address)
        expect(args.user).to.equal(user1.address)
        expect(args.amount).to.equal(amount)
        expect(args.balance).to.equal(0)
      })

    })

    describe('Failure', () => {
      it('fails for insufficient balance', async () => {
        await expect(exchange.connect(user1).withdrawToken(token1.address, amount)).to.be.reverted
      })
    })

  })

  describe('Checking Balances', () => {
    let tx, result
    let amount = tokens(1)

    beforeEach(async () => {
      tx = await token1.connect(user1).approve(exchange.address, amount)
      result = await tx.wait()

      tx = await exchange.connect(user1).depositToken(token1.address, amount)
      result = await tx.wait()
      })

        it('returns user balance', async () => {
          expect(await exchange.balanceOf(token1.address, user1.address)).to.equal(amount)
        })
  })

  describe('Making Orders', async () => {
    let tx, result
    let amount = tokens(1)

    describe('Success', async () => {
      beforeEach(async () => {

      tx = await token1.connect(user1).approve(exchange.address, amount)
      result = await tx.wait()

      tx = await exchange.connect(user1).depositToken(token1.address, amount)
      result = await tx.wait()

      tx = await exchange.connect(user1).makeOrder(token2.address, amount, token1.address, tokens(1))
      result = await tx.wait()
    })

      it('tracks the newly created order', async () => {
        expect(await exchange.ordersCount()).to.equal(1)
      })

      it('emits an order event', async () => {
        const event = result.events[0] // 2 events are emitted
        expect(event.event).to.equal('Order')

        const args = event.args
        expect(args.user).to.equal(user1.address)
        expect(args.tokenGet).to.equal(token2.address)
        expect(args.amountGet).to.equal(tokens(1))
        expect(args.tokenGive).to.equal(token1.address)
        expect(args.amountGive).to.equal(tokens(1))
        expect(args.timestamp).to.at.least(1)
      })
    })

    describe('Failure', async () => {
      it('rejects with no balance', async () => {
        await expect(exchange.connect(user1).makeOrder(token2.address, amount, token1.address, amount)).to.be.reverted
      })
    })
  })

  describe('Order Actions', async () => {
    let tx, result
    let amount = tokens(1)

    beforeEach(async () => {
      tx = await token1.connect(user1).approve(exchange.address, amount)
      result = await tx.wait()

      tx = await exchange.connect(user1).depositToken(token1.address, amount)
      result = await tx.wait()

      tx = await token2.connect(deployer).transfer(user2.address, tokens(100))
      result = await tx.wait()

      tx = await token2.connect(user2).approve(exchange.address, tokens(2))
      result = await tx.wait()

      tx = await exchange.connect(user2).depositToken(token2.address, tokens(2))
      result = await tx.wait()

      tx = await exchange.connect(user1).makeOrder(token2.address, amount, token1.address, amount)
      result = await tx.wait()
    })

    describe('Cancelling Orders', async () => {

      describe('Success', async () => {
        beforeEach(async () => {
          tx = await exchange.connect(user1).cancelOrder(1)
          result = await tx.wait()
        })

        it('expects canceled order', async () => {
          expect(await exchange.orderCancelled(1)).to.equal(true)
        })

        it('emits a cancel event', async () => {
        const event = result.events[0] // 2 events are emitted
        expect(event.event).to.equal('Cancel')

        const args = event.args
        expect(args.user).to.equal(user1.address)
        expect(args.tokenGet).to.equal(token2.address)
        expect(args.amountGet).to.equal(tokens(1))
        expect(args.tokenGive).to.equal(token1.address)
        expect(args.amountGive).to.equal(tokens(1))
        expect(args.timestamp).to.at.least(1)
      })
      })

      describe('Failure', async () => {
         beforeEach(async () => {
           tx = await token1.connect(user1).approve(exchange.address, amount)
          result = await tx.wait()

          tx = await exchange.connect(user1).depositToken(token1.address, amount)
          result = await tx.wait()

          tx = await exchange.connect(user1).makeOrder(token2.address, amount, token1.address, amount)
          result = await tx.wait()

        })
        it('rejects invalid order IDs', async () => {
          const invalidOrderId = 99999
          await expect(exchange.connect(user1).cancelOrder(invalidOrderId)).to.be.reverted
        })

        it('rejects unauthorized cancelations', async () => {
          await expect(exchange.connect(user2).cancelOrder(1)).to.be.reverted
        })

      })

    })

    describe('Filling Orders', async () => {
      describe('Success', async () => {
        beforeEach(async () => {
          // user2 fills order
          tx = await exchange.connect(user2).fillOrder(1)
          result = await tx.wait()
        })

        it('executes the trade and charge fees', async () => {
          // Token Give
          expect(await exchange.balanceOf(token1.address, user1.address)).to.equal(tokens(0))
          expect(await exchange.balanceOf(token1.address, user2.address)).to.equal(tokens(1))
          expect(await exchange.balanceOf(token1.address, feeAccount.address)).to.equal(tokens(0))
          // Token get
          expect(await exchange.balanceOf(token2.address, user1.address)).to.equal(tokens(1))
          expect(await exchange.balanceOf(token2.address, user2.address)).to.equal(tokens(0.9))
          expect(await exchange.balanceOf(token2.address, feeAccount.address)).to.equal(tokens(0.1))
        })

        it('updates filled orders', async () => {
          expect(await exchange.orderFilled(1)).to.equal(true)
        }) 

        it('emits a trade event', async () => {
          const event = result.events[0]
          expect(event.event).to.equal('Trade')

          const args = event.args
          expect(args.id).to.equal(1)
          expect(args.user).to.equal(user2.address)
          expect(args.tokenGet).to.equal(token2.address)
          expect(args.amountGet).to.equal(tokens(1))
          expect(args.tokenGive).to.equal(token1.address)
          expect(args.amountGive).to.equal(tokens(1))
          expect(args.creator).to.equal(user1.address)
          expect(args.timestamp).to.at.least(1)
        })
      })

      describe('Failure', async () => {
        it('rejects invalid order IDs', async () => {
          const invalidOrderId = 99999
          await expect(exchange.connect(user2).fillOrder(invalidOrderId)).to.be.reverted
        })

        it('rejects already filled orders', async () => {
          tx = await exchange.connect(user2).fillOrder(1)
          result = await tx.wait()

          await expect(exchange.connect(user2).fillOrder(1)).to.be.reverted
        })

        it('rejects canceled orders', async () => {
          tx = await exchange.connect(user1).cancelOrder(1)
          result = await tx.wait()

          await expect(exchange.connect(user2).fillOrder(1)).to.be.reverted
        })
        
      })

    })

  })
})
