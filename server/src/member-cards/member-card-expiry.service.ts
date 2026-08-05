import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { MemberCardsService } from './member-cards.service'

@Injectable()
export class MemberCardExpiryService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MemberCardExpiryService.name)
  private timer?: NodeJS.Timeout

  constructor(private readonly memberCards: MemberCardsService) {}

  onModuleInit() {
    void this.run()
    this.timer = setInterval(() => void this.run(), 60 * 60 * 1000)
    this.timer.unref()
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer)
  }

  private async run() {
    try {
      const result = await this.memberCards.expireDueCards()
      if (result.expired > 0) {
        this.logger.log(`completed ${result.expired} expired member card(s)`)
      }
    }
    catch (error) {
      this.logger.error('member card expiry job failed', error instanceof Error ? error.stack : undefined)
    }
  }
}
