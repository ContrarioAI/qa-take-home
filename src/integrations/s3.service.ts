import { Injectable } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { RecorderService } from './recorder.service';

/**
 * Stubbed S3. Never touches real storage. Records each move so tests can assert
 * temp -> public relocation and temp deletion.
 */
@Injectable()
export class S3Service {
  constructor(private readonly recorder: RecorderService) {}

  /**
   * Move a résumé from the temp bucket to the public bucket and delete the temp copy.
   * @param tempKey the temp bucket key that came in on the request
   * @param fileName original file name, used to build the public key
   * @returns the new public URL persisted to the candidate/RC rows
   */
  moveResumeToPublic(tempKey: string, fileName: string): string {
    const publicKey = `${uuidv4()}/resume-${fileName}`;
    const publicUrl = `https://public-bucket.example.com/${publicKey}`;

    this.recorder.record('s3', 'move_resume', {
      from: tempKey,
      to: publicUrl,
      deletedTemp: true,
    });

    return publicUrl;
  }
}
