import { useEffect, useRef, useState } from 'react';
import { shareUrlForEvent } from '../lib/urlState';
import { CheckIcon, LinkIcon, ShareIcon } from './icons';

const canShare = () => typeof navigator !== 'undefined' && typeof navigator.share === 'function';

/**
 * Share a story: the system share sheet where there is one (phones, Safari),
 * otherwise copy the link. Cancelling the share sheet is not an error.
 */
export function ShareButton({ eventId, headline }: { eventId: string; headline: string }) {
  const [copied, setCopied] = useState(false);
  const native = canShare();
  const timer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => clearTimeout(timer.current), []);

  const onClick = async () => {
    const url = shareUrlForEvent(eventId);
    if (native) {
      try {
        await navigator.share({ title: headline, text: headline, url });
        return;
      } catch (error) {
        if ((error as DOMException)?.name === 'AbortError') return;
        // share refused (no user activation, unsupported data): fall through to copy
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1800);
    } catch {
      // clipboard blocked (insecure context / denied) — the URL bar already
      // carries the link, so this is a convenience, not the only route
    }
  };

  return (
    <>
      <button className="share-btn" onClick={onClick} aria-label={native ? 'Share this story' : 'Copy link to this story'}>
        {copied ? <CheckIcon size={14} /> : native ? <ShareIcon size={14} /> : <LinkIcon size={14} />}
        <span className="share-label">{copied ? 'Copied' : native ? 'Share' : 'Copy link'}</span>
      </button>
      <span className="sr-only" role="status" aria-live="polite">
        {copied ? 'Link copied' : ''}
      </span>
    </>
  );
}
