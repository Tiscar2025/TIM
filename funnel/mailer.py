import os
import random
import string
import time

from typing import Union

MAIL_DIR = "/service/mail"


#CLIENT_RATE        = 20  # Max messages per client rate window
#CLIENT_RATE_WINDOW = 60  # In seconds
CLIENT_RATE        =  3  # Max messages per client rate window
CLIENT_RATE_WINDOW = 10  # In seconds


class Mailer:
    def __init__(self,
                 mail_dir: str = MAIL_DIR,
                 client_rate: int = CLIENT_RATE,
                 client_rate_window: int = CLIENT_RATE_WINDOW,
                 dry_run: bool = False):

        self.mail_dir = mail_dir
        if not os.path.exists(mail_dir):
            os.mkdir(mail_dir)

        self.client_rate = client_rate
        self.client_rate_window = client_rate_window
        self.dry_run = dry_run

        self.first_message_time = None
        self.messages_remaining = CLIENT_RATE

    def get_first_filename(self) -> str:
        return os.path.join(self.mail_dir, 'first')

    def get_last_filename(self) -> str:
        return os.path.join(self.mail_dir, 'last')

    def get_random_filenames(self) -> str:
        while True:
            without_path = ''.join([random.choice(string.ascii_letters) for _ in range(16)])
            with_path = os.path.join(self.mail_dir, without_path)
            if not os.path.isfile(with_path):
                return with_path, without_path

    def set_next(self, filename: str, next_filename: str):
        with open(filename, 'r') as f_src:
            lines = [line for line in f_src]

        if len(lines) < 4:
            print('Syntax error in file ' + filename)
            return

        lines[0] = next_filename
        with open(filename, 'w') as f_dest:
            f_dest.write('\n'.join(lines))

    def queue_mail(self, sender: str, rcpt: str, msg: str):
        this_absfile, this_relfile = self.get_random_filenames()
        with open(this_absfile, 'w') as f:
            f.write('\n'.join(['', sender, rcpt, msg]))

        first_file = self.get_first_filename()
        last_file = self.get_last_filename()

        if not os.path.islink(first_file):
            files = os.listdir(self.mail_dir)
            if len(files) > 1:
                print("! Files = " + str(files))
                os.symlink(files[0], first_file)
            else:
                os.symlink(this_relfile, first_file)

        if os.path.islink(last_file):
            self.set_next(last_file, this_relfile)
            os.unlink(last_file)

        os.symlink(this_relfile, last_file)

    def has_messages(self):
        return os.path.islink(self.get_first_filename())

    def dequeue_message(self) -> Union[dict, None]:
        first_file = self.get_first_filename()
        if not os.path.isfile(first_file):
            return None

        with open(first_file, 'r') as f_src:
            lines = [line for line in f_src]

        if len(lines) < 4:
            print('Syntax error in file ' + first_file)
            return None

        os.unlink(first_file)
        if lines[0] == '':
            os.unlink(self.get_last_filename())
        else:
            os.symlink(lines[0], first_file)

        return {'From': lines[1], 'To': lines[2], 'Msg': '\n'.join(lines[3:])}

    def send_message(self, msg: dict):
        if self.dry_run:
            return

            print('Sending a new message')
        for (key, val) in msg.items():
            print('{}: {}'.format(key, val))
        print()

    def update(self):
        if self.first_message_time is not None:
            window_age = time.time() - self.first_message_time
            print(window_age)
            if window_age > self.client_rate_window:
                # New window
                print('A new window is opened')
                self.first_message_time = None
                self.messages_remaining = self.client_rate

        if not self.has_messages():
            return

        if self.messages_remaining < 1:
            print('Rate limit exceeded, delaying send')
            return

        self.send_message(self.dequeue_message())
        self.messages_remaining -= 1
        if self.first_message_time is None:
            self.first_message_time = time.time()
