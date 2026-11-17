import { queueIn, resizeFor, uploadPending } from './photos';
import { memoryStore } from '../test/fakes';

describe('photos', () => {
  it('resizes to 1600 px on the long edge, never up', () => {
    expect(resizeFor(4000, 3000)).toEqual({ width: 1600 });
    expect(resizeFor(3000, 4000)).toEqual({ height: 1600 });
    expect(resizeFor(1600, 1200)).toBeNull();
    expect(resizeFor(800, 600)).toBeNull();
  });

  it('uploads pending photos when home, and keeps them while away', async () => {
    const queue = queueIn(memoryStore(), 'pending_photos');
    await queue.add('a');
    await queue.add('b');
    await queue.add('a');
    expect(await queue.pending()).toEqual(['a', 'b']);

    expect(await uploadPending(queue, async () => 'away')).toEqual({ uploaded: 0, left: 2 });
    expect(await queue.pending()).toEqual(['a', 'b']);

    const sent: string[] = [];
    expect(
      await uploadPending(queue, async (id) => {
        sent.push(id);
        return id === 'a' ? 'uploaded' : 'failed';
      }),
    ).toEqual({ uploaded: 1, left: 1 });
    expect(sent).toEqual(['a', 'b']);
    expect(await queue.pending()).toEqual(['b']);
  });
});
