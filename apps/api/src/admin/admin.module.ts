import { Module } from '@nestjs/common';
import { QuizModule } from '../quiz/quiz.module';
import { AdminSession } from './admin-session';
import { AdminController } from './admin.controller';
import { AdminGuard } from './admin.guard';
import { AdminService } from './admin.service';

@Module({
  imports: [QuizModule],
  controllers: [AdminController],
  providers: [AdminService, AdminSession, AdminGuard],
})
export class AdminModule {}
