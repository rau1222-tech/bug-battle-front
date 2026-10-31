import { useState, type ReactNode } from 'react';
import { ChevronDown, KeyRound, LogOut, Settings, UserRound, Volume2, VolumeX } from 'lucide-react';
import ChangePasswordDialog from '@/components/auth/ChangePasswordDialog';
import DeleteAccountDialog from '@/components/auth/DeleteAccountDialog';
import EditProfileModal from '@/components/auth/EditProfileModal';
import SettingsDialog from '@/components/auth/SettingsDialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAuthContext } from '@/contexts/AuthContext';
import { updateSettings, useSettings } from '@/lib/settings';
import { useI18n } from '@/i18n';
import { cn } from '@/lib/utils';
import { dialogContentClass, primaryButtonClass, secondaryButtonClass } from './dialogStyles';

type DialogId = 'profile' | 'password' | 'settings' | 'signOut' | 'delete' | null;

const itemClass =
  'gap-3 px-3 py-2 rounded-md text-xs font-display tracking-wide text-cyan-100/75 cursor-pointer focus:bg-cyan-500/10 focus:text-cyan-50 [&>svg]:h-4 [&>svg]:w-4 [&>svg]:text-cyan-300/70';

export default function ProfileMenu() {
  const { t, locale } = useI18n();
  const { user, profile, signOut, updateProfile } = useAuthContext();
  const { soundEnabled } = useSettings();
  const [dialog, setDialog] = useState<DialogId>(null);
  const [open, setOpen] = useState(false);

  const email = user.email ?? '';
  // OAuth users who later set a password keep no 'email' identity, so the flag in metadata covers them.
  const hasPassword = (user.identities?.some((i) => i.provider === 'email') ?? false) || user.user_metadata?.has_password === true;
  const total = profile.wins + profile.losses;
  const winRate = total > 0 ? `${Math.round((profile.wins / total) * 100)}%` : '—';
  const nf = new Intl.NumberFormat(locale);

  const openDialog = (id: DialogId) => () => setDialog(id);
  const dialogProps = (id: Exclude<DialogId, null>) => ({
    open: dialog === id,
    onOpenChange: (next: boolean) => setDialog(next ? id : null),
  });

  return (
    <div className="fixed top-4 right-4 z-30">
      {/* modal={false} so dialogs opened from items don't inherit the menu's pointer lock */}
      <DropdownMenu open={open} onOpenChange={setOpen} modal={false}>
        <DropdownMenuTrigger
          aria-label={t('auth.openMenu')}
          className="flex items-center gap-2 pl-1 pr-2.5 py-1 rounded-full bg-[hsl(220,20%,8%)]/80 border border-cyan-500/20 backdrop-blur-md shadow-lg shadow-black/40 transition-all hover:border-cyan-400/40 hover:shadow-[0_0_20px_-6px_rgb(var(--theme-400)/0.5)] data-[state=open]:border-cyan-400/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/50 group"
        >
          <Avatar url={profile.avatar_url} name={profile.display_name} size="sm" />
          <span className="font-display text-xs text-cyan-100/80 tracking-wide group-hover:text-cyan-50 transition-colors max-w-[120px] truncate">
            {profile.display_name}
          </span>
          <ChevronDown className={cn('h-3.5 w-3.5 text-cyan-300/60 transition-transform', open && 'rotate-180')} />
        </DropdownMenuTrigger>

        <DropdownMenuContent
          align="end"
          sideOffset={8}
          className="w-72 p-0 rounded-xl border-cyan-500/20 bg-[hsl(220,20%,7%)]/95 text-cyan-100 backdrop-blur-xl shadow-2xl shadow-black/60 overflow-hidden"
        >
          <div className="relative px-4 pt-4 pb-3 bg-gradient-to-br from-cyan-500/15 via-transparent to-transparent">
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-400/60 to-transparent" />
            <div className="flex items-center gap-3">
              <Avatar url={profile.avatar_url} name={profile.display_name} size="lg" />
              <div className="min-w-0">
                <p className="font-display text-sm text-cyan-50 tracking-wide truncate">{profile.display_name}</p>
                {email && <p className="text-[11px] font-body text-cyan-300/50 truncate">{email}</p>}
              </div>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-1.5">
              <Stat label={t('auth.statsWins')} value={nf.format(profile.wins)} className="text-emerald-300" />
              <Stat label={t('auth.statsLosses')} value={nf.format(profile.losses)} className="text-red-300" />
              <Stat label={t('auth.statsWinRate')} value={winRate} className="text-cyan-200" />
            </div>
          </div>

          <div className="p-1.5">
            <DropdownMenuItem className={itemClass} onSelect={openDialog('profile')}>
              <UserRound /> {t('auth.myData')}
            </DropdownMenuItem>
            {email && (
              <DropdownMenuItem className={itemClass} onSelect={openDialog('password')}>
                <KeyRound /> {hasPassword ? t('auth.changePassword') : t('auth.setPassword')}
              </DropdownMenuItem>
            )}
            <DropdownMenuItem className={itemClass} onSelect={openDialog('settings')}>
              <Settings /> {t('settings.title')}
            </DropdownMenuItem>
            <DropdownMenuItem
              className={itemClass}
              onSelect={(e) => {
                e.preventDefault();
                updateSettings({ soundEnabled: !soundEnabled });
              }}
            >
              {soundEnabled ? <Volume2 /> : <VolumeX />}
              <span className="flex-1">{t('settings.soundEffects')}</span>
              <MiniSwitch on={soundEnabled} />
            </DropdownMenuItem>
          </div>

          <DropdownMenuSeparator className="mx-0 my-0 bg-cyan-500/10" />

          <div className="p-1.5">
            <DropdownMenuItem
              className={cn(itemClass, 'text-red-300/80 focus:bg-red-500/10 focus:text-red-200 [&>svg]:text-red-400/70')}
              onSelect={openDialog('signOut')}
            >
              <LogOut /> {t('auth.signOut')}
            </DropdownMenuItem>
          </div>
        </DropdownMenuContent>
      </DropdownMenu>

      <EditProfileModal
        {...dialogProps('profile')}
        profile={profile}
        email={email || undefined}
        onSave={updateProfile}
        onDeleteAccount={openDialog('delete')}
      />
      {email && <ChangePasswordDialog {...dialogProps('password')} email={email} hasPassword={hasPassword} />}
      <SettingsDialog {...dialogProps('settings')} />
      <DeleteAccountDialog {...dialogProps('delete')} userId={user.id} displayName={profile.display_name} />

      <AlertDialog {...dialogProps('signOut')}>
        <AlertDialogContent className={dialogContentClass}>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display tracking-wider text-cyan-100">{t('auth.signOutConfirmTitle')}</AlertDialogTitle>
            <AlertDialogDescription className="text-xs font-body text-cyan-300/50">{t('auth.signOutConfirmDesc')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel className={cn(secondaryButtonClass, 'mt-0 bg-transparent hover:bg-transparent')}>
              {t('auth.cancel')}
            </AlertDialogCancel>
            <AlertDialogAction className={primaryButtonClass} onClick={() => void signOut()}>
              {t('auth.signOut')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Avatar({ url, name, size }: { url: string | null; name: string; size: 'sm' | 'lg' }) {
  const dims = size === 'sm' ? 'w-7 h-7 text-[10px] border' : 'w-12 h-12 text-sm border-2';
  if (url) {
    return (
      <img
        src={url}
        alt=""
        className={cn(dims, 'rounded-full object-cover border-cyan-400/40 shrink-0')}
        referrerPolicy="no-referrer"
      />
    );
  }
  const initials = name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
  return (
    <div className={cn(dims, 'rounded-full bg-cyan-900/60 border-cyan-400/40 flex items-center justify-center font-display font-bold text-cyan-100 shrink-0')}>
      {initials}
    </div>
  );
}

function Stat({ label, value, className }: { label: string; value: ReactNode; className?: string }) {
  return (
    <div className="rounded-md bg-black/30 border border-cyan-500/10 px-2 py-1.5 text-center">
      <p className={cn('font-display text-sm tabular-nums', className)}>{value}</p>
      <p className="text-[9px] font-body uppercase tracking-widest text-cyan-300/40 truncate">{label}</p>
    </div>
  );
}

function MiniSwitch({ on }: { on: boolean }) {
  return (
    <span
      aria-hidden
      className={cn('relative inline-flex h-4 w-7 shrink-0 rounded-full transition-colors', on ? 'bg-cyan-500/80' : 'bg-cyan-950')}
    >
      <span className={cn('absolute top-0.5 h-3 w-3 rounded-full bg-white shadow transition-transform', on ? 'translate-x-3.5' : 'translate-x-0.5')} />
    </span>
  );
}